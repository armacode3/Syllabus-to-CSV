import apiKeys from "./hidden.js";
const mistralApiKey = apiKeys.mistralApiKey;
const geminiApiKey = apiKeys.geminiApiKey;

const dragArea = document.querySelector('.drag-area');
const dragText = document.querySelector('.header');

let fileButton = document.querySelector('.button');
let fileInput = document.querySelector('input');

dragArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dragText.textContent = 'Release to Upload';
    dragArea.classList.add('active');

});

dragArea.addEventListener('dragleave', () => {
    dragText.textContent = 'Drag & Drop';
    dragArea.classList.remove('active');
});

dragArea.addEventListener('drop', async(event) => {
    event.preventDefault();
    dragText.textContent = 'Drag & Drop';
    dragArea.classList.remove('active');

    const fileUploaded = event.dataTransfer.files.item(0);
    if (fileUploaded == null) {
        console.log("Error");
        return;
    }

    try {
        const form = new FormData();
        form.append('purpose', 'ocr');
        form.append('file', new File([fileUploaded], `${fileUploaded.name}`));

        let ocrJson = await PDFToJson(form);

        let markdownExport = "";
        for (const element of ocrJson.pages) {
            markdownExport += element.markdown + " ";
        }
        console.log(markdownExport);

        const geminiJson = await JsonToCSV(markdownExport);

        if (!geminiJson || !geminiJson.candidates || !geminiJson.candidates[0]) {
            throw new Error("Invalid response from Gemini API");
        }

        const geminiResponse = geminiJson.candidates[0].content.parts[0].text;

        createFileAndDownload("assignments.csv", geminiResponse.slice(6).slice(0, -3));
    } catch (error) {
        console.error("Error processing file: ", error);
    }
});

fileButton.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async(event) => {
    // Get fileUploaded, returns file object at index 0
    const fileUploaded = event.target.files.item(0);
    if (fileUploaded == null) { // File is empty
        console.log("Error");
        return;
    }

    try{
        // Create form object for PDF send to OCR API
        const form = new FormData();
        form.append('purpose', 'ocr');
        form.append('file', new File([fileUploaded], `${fileUploaded.name}`));
    
        // Send to Mistral and get structured markdown
        let ocrJson = await PDFToJson(form);
        
        // Combine all markdown content into one string
        let markdownExport = "";
        for (const element of ocrJson.pages) {
            markdownExport += element.markdown + " ";
        }
        console.log(markdownExport);

        // Send combined markdown to Gemini for CSV generation
        const geminiJson = await JsonToCSV(markdownExport);

        if (!geminiJson || !geminiJson.candidates || !geminiJson.candidates[0]) {
            throw new Error("Invalid response from Gemini API");
        }

        const geminiResponse = geminiJson.candidates[0].content.parts[0].text;

        // Download the result as a .csv file
        createFileAndDownload("assignments.csv", geminiResponse.slice(6).slice(0, -3));
    } catch(error) {
        console.error("Error processing file:", error)
    }
});

/**
 * Convert a PDF to a JSON object
 * 
 * @param {FormData} form
 * @returns {Promise<Object>}
 */
async function PDFToJson(form) {
    try {
        const uploadedPDF = await fetch('https://api.mistral.ai/v1/files', {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${mistralApiKey}`
            },
            body: form,
        });

        if (!uploadedPDF.ok) {
            throw new Error(`File upload failed ${uploadedPDF.status} ${uploadedPDF.statusText}`);
        }

        const PDFJson = await uploadedPDF.json();
        console.log("File uploaded successfully:", PDFJson.id);

        const PDFLink = await fetch(`https://api.mistral.ai/v1/files/${PDFJson.id}/url?expiry=24`, {
            method: 'GET',
            headers: {
                "Accept": "application/json",
                "Authorization": `Bearer ${mistralApiKey}`
            },
        });

        if (!PDFLink.ok) {
            throw new Error(`Failed to get file URL: ${PDFLink.status} ${PDFLink.statusText}`);
        }

        const responseJSON = await PDFLink.json();
        console.log("Retrieved file URL successfully", responseJSON.url);

        const OCRCall = await fetch('https://api.mistral.ai/v1/ocr', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mistralApiKey}`
            },
            body: JSON.stringify({
                "model": "mistral-ocr-latest",
                "document": {
                    "type": "document_url",
                    "document_url": responseJSON.url
                },
                "include_image_base64": true
            }),
        });

        if (!OCRCall.ok) {
            throw new Error(`OCR processing failed: ${OCRCall.status} ${OCRCall.statusText}`);
        }

        const OCRJson = await OCRCall.json();
        console.log("OCR processing completed successfully");
        return OCRJson;
    } catch (error) {
        console.error("Error in PDFToJson:", error);
        throw error;
    }
}

/**
 * Convert markdown text to CSV of assignments using Gemini API
 * 
 * @param {string} markdownExport 
 * @returns {Promise<Object>}
 */
async function JsonToCSV(markdownExport) {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Task: Extract ALL assingments, exams, and course schedule items from the Markdown text below and convert them into a structured CSV format.
                               Context: I need to organize my academic schedule from various classes into a spreadsheet-compatible format. The Markdown contains course
                               schedules, assignment information, due dates, class names, and other academic events. The information may be presented in different formats
                               including tables, lists, and paragraphs.
                               
                               Format: Generate a CSV file with the following columns:
                               1. Due Date (in MM/DD/YYYY format; if only day of week is given, use the date from the course schedule)
                               2. Class (the course name or code)
                               3. Assignment Name (the title or description of the assignment, topic, or event)
                               4. Assignment Type (categorize each as one of: Homework, Reading, Project, Exam, Lecture, Lab)
                               5. Checkbox (include "[ ]" for each item to track completion)
                               
                               Special Instructions:
                               - TABLES: Parse all tabular data. Tables often contain the course schedule with dats and topics.
                               - Convert all table rows to individual entries in the CSV.
                               - For course schedule tables, categorize topics/chapters as "Lecture" type.
                               - If a row contains "EXAM", "Test", "Quiz", or "Final", categorize it as "Exam" type.
                               - When only day abbreviations are given (M, T, W, Th, F), use the corresponding date if available.
                               - Include ALL dates and events found in the document, not just explicit assignments.
                               
                               Example of expected output for mixed content including tables:
                               Due Date,Class,Assignment Name,Assignment Type,Checkbox
                               01/15/2025,CSE260,Propositional Logic,Lecture,[ ]
                               01/22/2025,CSE260,Propositional Equivalences,Lecture,[ ]
                               02/26/2025,CSE260,EXAM 1,Exam,[ ]
                               03/26/2025,CSE260,EXAM 2,Exam,[ ]
                               04/30/2025,CSE260,FINAL EXAM,Exam,[ ]
                               Wednesdays,CSE260,Weekly Homework,Homework,[ ]
                               
                               Instructions:
                               1. Analyze ALL content including tables, lists, and paragraphs
                               2. Extract every date, topic, and academic event
                               3. For tables, convert each row to a SCV entry
                               4. Format the output exactly as shown in the example
                               5. If a specific date isn't given but can be inferred from context, use the inferred date
                               6. Do not include any explanations or additional text in your repsonse, only the CSV content
                               
                               Here's the Markdown to extract from:
                               ${markdownExport}`
                    }]
                }],
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API request failed: ${response.status} ${response.statusText}`);
        }

        console.log("Gemini response successful")
        const responseJson = await response.json();
        return responseJson;
    } catch(error) {
        console.error("Error in JsonToCSV: ", error);
    }
}

/**
 * Creates and triggers download of a file with specified content
 * 
 * @param {string} filename 
 * @param {string} content 
 */
function createFileAndDownload(filename, content) {
    // Create object Blob
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); // Generate a temporary download link
    
    // Create an anchor tag and set its href to URL
    const link = document.createElement('a'); 
    link.href = url;
    link.download = filename; // Tells browser what to name the download file
    document.body.appendChild(link);
    const p = document.createElement('p');
    p.innerHTML = filename;
    link.append(p);
}
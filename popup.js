import apiKeys from "./hidden.js";
const mistralApiKey = apiKeys.mistralApiKey;
const geminiApiKey = apiKeys.geminiApiKey;

document.getElementById('file-upload').addEventListener('change', async(event) => {
    const fileUploaded = event.target.files.item(0);
    if (fileUploaded == null) { // File is empty
        console.log("Error: No file selected");
        return;
    }
    const form = new FormData();
    form.append('purpose', 'ocr');
    form.append('file', new File([fileUploaded], `${fileUploaded.name}`));

    try {
        const result = await PDFToJson(form);
        console.log("OCR processing complete:", result);
    } catch(error) {
        console.error("Error Processing PDF: ", error);
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
                    "document-url": responseJSON.url
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
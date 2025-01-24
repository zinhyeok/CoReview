// Background script to handle communication between content.js and popup
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed!");
  });
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "sendKeywords") {
      console.log("Received keywords:", message.keywords);
      sendResponse({ status: "success" });
    }
  });
  
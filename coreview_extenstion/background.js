// Background script to handle communication between content.js and popup
// Background script to handle communication between content.js and popup.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("🚀 Extension installed!");
});

// 메시지 리스너 추가 (content.js → popup.js 데이터 전달)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) {
      console.error("❌ 잘못된 요청:", request);
      sendResponse({ success: false, message: "잘못된 요청입니다." });
      return;
  }

  console.log("📩 백그라운드에서 메시지 받음:", request);

  // 크롤링 시작 요청 처리
  if (request.action === "startCrawling") {
      console.log("🔄 크롤링 시작...");
      sendResponse({ success: true, message: "크롤링을 시작합니다." });
  }

  // Flask 분석 완료 후 popup.js로 전송
  else if (request.action === "showAnalysis") {
      console.log("📨 분석 결과 popup.js로 전송...");
      
      chrome.runtime.sendMessage({
          action: "displayAnalysisResults",
          data: request.data
      });

      sendResponse({ success: true, message: "결과 전달 완료" });
  }
});
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.type === "sendKeywords") {
//       console.log("Received keywords:", message.keywords);
//       sendResponse({ status: "success" });
//     }
//   });
  
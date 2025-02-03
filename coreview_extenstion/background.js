// Background script to handle communication between content.js and popup.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("🚀 Extension installed!");
});

// 탭별 실행상태 저장
let tabStates = {};
let tabJsonData = {}; //json 결과저장(키워드 결과)
let failedReviewData = {};  // json 통신 실패 시 저장 

// 메시지 처리 리스너 크롤링과 통합
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = request.tabId || (sender.tab ? sender.tab.id : null);

  if (!tabId) {
    sendResponse({ success: false, error: "Tab ID가 없습니다." });
    return true;
  }

  console.log("📩 메시지 수신:", request);

  switch (request.action) {
    case "getState":
      sendResponse({
        state: tabStates[tabId] || "start-screen",
        jsonData: tabJsonData[tabId] || null
      });
      break;

    case "setState":
      tabStates[tabId] = request.state;
      if (request.jsonData) {
        tabJsonData[tabId] = request.jsonData;
      }
      console.log(`✅ 탭 ${tabId}의 상태가 저장되었습니다:`, request.state);
      sendResponse({ success: true });
      break;

    case "startCrawling":
      console.log("🔄 크롤링 시작...");
      sendResponse({ success: true, message: "크롤링을 시작합니다." });
      break;

    case "showAnalysis":
      console.log("📨 분석 결과 popup.js로 전송...");
      chrome.runtime.sendMessage({
        action: "displayAnalysisResults",
        data: request.data,
      });
      sendResponse({ success: true, message: "결과 전달 완료" });
      break;

      case "saveFailedData":
        failedReviewData[tabId] = request.data;
        console.log("❌ 전송 실패 데이터 저장:", request.data);
        sendResponse({ success: true });
        break;
  
    case "retrySendData":
      if (failedReviewData[tabId]) {
        chrome.runtime.sendMessage({ action: "retrySendData", data: failedReviewData[tabId] });
      } else {
        sendResponse({ success: false, message: "재전송할 데이터가 없습니다." });
      }
      break;

    default:
      sendResponse({ success: false, error: "알 수 없는 액션입니다." });
  }
  // 비동기 응답을 보장하기 위해 true 반환
  return true;
});

// 탭이 닫힐 때 상태 제거
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabStates[tabId]) {
    delete tabStates[tabId];
    console.log(`🗑️ 탭 ${tabId}의 상태가 제거되었습니다.`);
  }
});
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fast-btn").addEventListener("click", () => {
    startCrawling(90, true);
  });

  document.getElementById("slow-btn").addEventListener("click", () => {
    startCrawling(Infinity, false);
  });
});

  
function startCrawling(limit, includeLowRatings) {
  showLoadingScreen();
}

function showLoadingScreen() {
  document.getElementById("start-screen").style.display = "none";
  // 미리 로드
  const loadingImg = new Image();
  loadingImg.src = "../imgs/loading.gif";

  // 렌더링 보장
  document.getElementById("loading-screen").style.display = "block";
  setTimeout(() => {
    document.getElementById("loading-screen").style.opacity = "1";
  }, 0);
}

function downloadCSV(data) {
  const csvContent =
    "data:text/csv;charset=utf-8," +
    "이름,작성일자,평점,리뷰 내용\n" +
    data.map(r => `"${r.userName}","${r.date}","${r.rating}","${r.content}"`).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "crawled_reviews.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// function displayKeywords(keywords) {
//   document.getElementById("loading").style.display = "none";
//   document.getElementById("keywords").style.display = "block";

//   const keywordList = document.getElementById("keyword-list");
//   keywordList.innerHTML = "";
//   keywords.forEach(keyword => {
//     const div = document.createElement("div");
//     div.classList.add("keyword");
//     div.textContent = `${keyword.text} (${keyword.count})`;
//     div.addEventListener("click", () => div.classList.toggle("selected"));
//     keywordList.appendChild(div);
//   });
  
// document.getElementById("organize-btn").addEventListener("click", () => {
//   const selectedKeywords = Array.from(document.querySelectorAll(".keyword.selected")).map(
//     keyword => keyword.textContent.split(" ")[0]
//   );
//   organizeReviews(selectedKeywords);
// });
// }

// function organizeReviews(keywords) {
// showLoadingScreen();
// fetch("http://localhost:5000/organize", {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ keywords })
// })
//   .then(response => response.json())
//   .then(data => {
//     displayReviews(data.reviews);
//   });
// }

// function displayReviews(reviews) {
// document.getElementById("loading").style.display = "none";
// document.getElementById("reviews").style.display = "block";

// const reviewList = document.getElementById("review-list");
// reviewList.innerHTML = "";
// reviews.forEach(review => {
//   const div = document.createElement("div");
//   div.classList.add("review-item");
//   div.textContent = review.text;
//   reviewList.appendChild(div);
// });
// }

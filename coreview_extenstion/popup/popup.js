document.getElementById("fast-btn").addEventListener("click", () => {
    fetchReviews(90);
  });
  
  document.getElementById("slow-btn").addEventListener("click", () => {
    fetchReviews("all");
  });
  
  function fetchReviews(type) {
    showLoadingScreen();
    fetch(`http://localhost:5000/reviews?type=${type}`)
      .then(response => response.json())
      .then(data => {
        displayKeywords(data.keywords);
      });
  }
  
  function showLoadingScreen() {
    document.getElementById("app").style.display = "none";
    document.getElementById("loading").style.display = "block";
  }
  
  function displayKeywords(keywords) {
    document.getElementById("loading").style.display = "none";
    document.getElementById("keywords").style.display = "block";
  
    const keywordList = document.getElementById("keyword-list");
    keywordList.innerHTML = "";
    keywords.forEach(keyword => {
      const div = document.createElement("div");
      div.classList.add("keyword");
      div.textContent = `${keyword.text} (${keyword.count})`;
      div.addEventListener("click", () => div.classList.toggle("selected"));
      keywordList.appendChild(div);
    });
  
    document.getElementById("organize-btn").addEventListener("click", () => {
      const selectedKeywords = Array.from(document.querySelectorAll(".keyword.selected")).map(
        keyword => keyword.textContent.split(" ")[0]
      );
      organizeReviews(selectedKeywords);
    });
  }
  
  function organizeReviews(keywords) {
    showLoadingScreen();
    fetch("http://localhost:5000/organize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords })
    })
      .then(response => response.json())
      .then(data => {
        displayReviews(data.reviews);
      });
  }
  
  function displayReviews(reviews) {
    document.getElementById("loading").style.display = "none";
    document.getElementById("reviews").style.display = "block";
  
    const reviewList = document.getElementById("review-list");
    reviewList.innerHTML = "";
    reviews.forEach(review => {
      const div = document.createElement("div");
      div.classList.add("review-item");
      div.textContent = review.text;
      reviewList.appendChild(div);
    });
  }
  
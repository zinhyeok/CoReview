import subprocess
import sys

def run_scripts():
    try:
        # Step 1: Run coupangCrawl.py
        print("Running coupangCrawl.py...")
        subprocess.run([sys.executable, "coupangCrawl.py"], check=True)

        # Step 2: Run review_analysis.py
        print("Running review_analysis.py...")
        subprocess.run([sys.executable, "review_analysis.py", "coupang_reviews"])

        print("Both scripts executed successfully!")

    except subprocess.CalledProcessError as e:
        print(f"An error occurred while running the scripts: {e}")

if __name__ == "__main__":
    run_scripts()

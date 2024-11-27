import pandas as pd

# 엑셀 파일 경로 설정
excel_file_path = '.\data\오란다.xlsx'

# 변환할 CSV 파일 경로 설정
csv_file_path = '.\data\oranda_review.csv'

# 엑셀 파일 읽기
df = pd.read_excel(excel_file_path)

# CSV 파일로 저장
df.to_csv(csv_file_path, index=False, encoding='utf-8')  # encoding='utf-8'로 저장 시 한글도 문제없이 처리 가능

print(f"CSV 파일로 저장 완료: {csv_file_path}")

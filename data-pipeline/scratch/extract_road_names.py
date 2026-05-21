import json

input_file = 'd:/DATN/traffic-ioc/data-pipeline/road_q1.json'
output_file = 'd:/DATN/traffic-ioc/data-pipeline/scratch/extracted_roads.json'

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

unique_names = set()
for element in data.get('elements', []):
    tags = element.get('tags', {})
    name = tags.get('name')
    if name:
        unique_names.add(name)

# Add some specific ones from user's previous list that might be missing or named differently
additional_names = [
    "Võ Văn Kiệt", "Điện Biên Phủ", "Nguyễn Thị Minh Khai", "Trần Hưng Đạo", 
    "Hàm Nghi", "Lê Lợi", "Nguyễn Huệ", "Đồng Khởi", "Pasteur", "Nam Kỳ Khởi Nghĩa"
]
unique_names.update(additional_names)

sorted_names = sorted(list(unique_names))

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(sorted_names, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(sorted_names)} unique road names from JSON.")

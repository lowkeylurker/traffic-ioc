import json

input_file = 'd:/DATN/traffic-ioc/data-pipeline/road_q1.json'

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

all_tags_with_name = []
for element in data.get('elements', []):
    tags = element.get('tags', {})
    for key, value in tags.items():
        if 'name' in key:
            all_tags_with_name.append(value)

unique_names = sorted(list(set(all_tags_with_name)))
print(f"Total unique names found (including all name variations): {len(unique_names)}")
for name in unique_names[:20]:
    print(f" - {name}")

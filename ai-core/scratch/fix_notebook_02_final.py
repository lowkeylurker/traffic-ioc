import nbformat

notebook_path = '/workspace/ai-core/notebooks/02_Hybrid_Resampling_and_CTGAN.ipynb'

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = nbformat.read(f, as_version=4)

target_code = "balanced_df, report = build_balanced_dataset_from_path("
fixed_code = """balanced_df, report = build_balanced_dataset_from_path(
    input_path=INPUT_PATH,
    output_path=OUTPUT_PATH,
    config=config
)"""

modified = False
for cell in nb.cells:
    if cell.cell_type == 'code' and target_code in cell.source:
        if "output_path=OUTPUT_PATH" not in cell.source:
            # Simple string replacement for the function call block
            # We look for the whole function call and replace it
            import re
            pattern = r"balanced_df, report = build_balanced_dataset_from_path\(\s*input_path=INPUT_PATH,\s*config=config\s*\)"
            cell.source = re.sub(pattern, fixed_code, cell.source)
            modified = True
            print("✅ Đã cập nhật cell gọi hàm trong Notebook.")

if modified:
    with open(notebook_path, 'w', encoding='utf-8') as f:
        nbformat.write(nb, f)
else:
    print("⚠️ Không tìm thấy cell cần sửa hoặc cell đã được sửa rồi.")

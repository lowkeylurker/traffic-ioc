import json

notebook_path = "/workspace/ai-core/notebooks/05_Double_DQN_Training_Loop.ipynb"

with open(notebook_path, 'r', encoding='utf-8') as f:
    nb = json.load(f)

for cell in nb.get('cells', []):
    if cell.get('cell_type') == 'code':
        source = "".join(cell.get('source', []))
        if "RLTrainingConfig(" in source:
            # Replace epsilon_decay
            source = source.replace("epsilon_decay=0.985,", "epsilon_decay=0.96,          # Chạm đáy 0.05 ở khoảng episode 75")
            source = source.replace("Chạm đáy 0.05 ở khoảng episode 190", "") # Remove old comment if it was on the same line or next
            # Actually, regex replacement or simpler string replace is safer
            
            # Let's do exact replacements line by line
            lines = source.split('\n')
            new_lines = []
            for line in lines:
                if "epsilon_decay=0.985" in line:
                    new_lines.append("    epsilon_decay=0.96,          # Chạm đáy 0.05 ở khoảng episode 75 (phù hợp 100 episodes)")
                elif "warmup_steps=20000" in line:
                    new_lines.append("    warmup_steps=10000,          # Thu thập kinh nghiệm trong 1 episode đầu")
                elif "target_update=5" in line:
                    new_lines.append("    target_update=3,             # Cập nhật mạng Target sau mỗi 3 episode")
                else:
                    new_lines.append(line)
                    
            cell['source'] = [line + '\n' for line in new_lines[:-1]] + [new_lines[-1]] if new_lines else []
            break

with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(nb, f, indent=1)

print("Updated config in notebook 05 successfully.")

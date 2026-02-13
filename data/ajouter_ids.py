import json

# Chemin vers ton fichier (adapte si besoin)
INPUT_FILE = "quiz_questions.json"
OUTPUT_FILE = "quiz_questions_with_ids.json"

# Charger le fichier
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

questions = data["questions"]

# Ajouter un ID unique à chaque question (1, 2, 3, ...)
for i, q in enumerate(questions, start=1):
    # On insère l'id en première position
    new_q = {"id": i}
    new_q.update(q)
    questions[i - 1] = new_q

data["questions"] = questions

# Sauvegarder le nouveau fichier
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"Terminé ! {len(questions)} questions numérotées de 1 à {len(questions)}")
print(f"Fichier sauvegardé : {OUTPUT_FILE}")

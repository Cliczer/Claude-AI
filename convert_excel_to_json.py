import pandas as pd
import json

# ═══════════════════════════════════════════════════════════════════
#  CONFIG
# ═══════════════════════════════════════════════════════════════════
FICHIER_EXCEL     = "ATLAS_COMPLET.xlsx"
FICHIER_ARBRE     = "arbre_dynamique.json"
FICHIER_ETUDES    = "base_etudes.json"

COL_REFERENCE     = "Lien/ Référence études"
COL_OBJECTIF      = "Objectif de l'étude"
COL_NIVEAU_PREUVE = "Niveau de preuve"
COL_ISSUES        = "Issues"

COLS_CRITERES = [
    "T", "N", "RE", "RP", "HER2", "Grade",
    "Ki67 (%)", "Marges (mm)", "Age", "Emboles", "Triple N", "MCC",
]

COLS_TRAITEMENTS_ETUDES = [
    "Chirurgie mammaire", "Chirurgie axillaire", "RT",
    "CNA", "CT rattrapage", "CTadj", "Immunothérapie", "Hormonothérapie",
]

MAPPING = {
    "T":       "T", "N":       "N", "RE":      "RE", "RP":      "RP",
    "HER2":    "HER2", "Grade":   "Grade", "Ki67":    "Ki67 (%)",
    "Marges":  "Marges (mm)", "Age":     "Age", "Emboles": "Emboles",
    "TripleN": "Triple N", "MCC":     "MCC",
}

# ═══════════════════════════════════════════════════════════════════
#  NETTOYAGE UNIVERSEL
# ═══════════════════════════════════════════════════════════════════
_VALEURS_VIDES = {"-1", "-1.0", "nan", "NaN", "None", "NaT", ""}

def nettoyer_valeur(x) -> str:
    if x is None: return "-1"
    s = str(x).strip()
    if s in _VALEURS_VIDES: return "-1"
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except ValueError:
        return s

def nettoyer_df(df: pd.DataFrame) -> pd.DataFrame:
    return df.apply(lambda col: col.map(nettoyer_valeur)).astype(str)

# ═══════════════════════════════════════════════════════════════════
#  MISSION 1 – arbre_dynamique.json
# ═══════════════════════════════════════════════════════════════════
def detecter_colonnes(df: pd.DataFrame):
    cols_q, cols_t, cols_i = [], [], []
    for col in df.columns:
        if col.startswith("OUT_"): cols_t.append(col)
        elif col.startswith("INFO_"): cols_i.append(col)
        else: cols_q.append(col)
    return cols_q, cols_t, cols_i

def creer_arbre(df_local: pd.DataFrame, liste_q: list, cols_t: list) -> dict:
    while liste_q:
        question = liste_q[0]
        valeurs  = [v for v in df_local[question].unique() if v != "-1"]
        if valeurs: break
        liste_q = liste_q[1:]
    else:
        donnees = {col: (df_local[col].iloc[0] if len(df_local) > 0 else "-1") for col in cols_t}
        return {"type": "resultat", "donnees": donnees}

    noeud = {"type": "decision", "titre": question, "choix": {}}
    for val in valeurs:
        sous_df = df_local[df_local[question] == val]
        noeud["choix"][val] = creer_arbre(sous_df, liste_q[1:], cols_t)
    return noeud

def generer_arbre(fichier: str) -> None:
    df_raw = pd.read_excel(fichier, sheet_name=0)
    cols_q, cols_t, _ = detecter_colonnes(df_raw)
    df = nettoyer_df(df_raw)
    arbre = creer_arbre(df, cols_q, cols_t)
    with open(FICHIER_ARBRE, "w", encoding="utf-8") as f:
        json.dump(arbre, f, indent=4, ensure_ascii=False)
    print(f"✅  {FICHIER_ARBRE} généré.")

# ═══════════════════════════════════════════════════════════════════
#  MISSION 2 – base_etudes.json
# ═══════════════════════════════════════════════════════════════════
def generer_base_etudes(fichier: str) -> None:
    df_raw = pd.read_excel(fichier, sheet_name=1)

    # 🚀 LA MAGIE EST ICI : On répare les cases fusionnées (Forward Fill)
    colonnes_a_remplir = [COL_REFERENCE, COL_OBJECTIF, COL_NIVEAU_PREUVE] + COLS_CRITERES
    for col in colonnes_a_remplir:
        if col in df_raw.columns:
            df_raw[col] = df_raw[col].ffill()

    df = nettoyer_df(df_raw)
    cols = list(df.columns)

    if COL_ISSUES in cols:
        idx_issues = cols.index(COL_ISSUES)
        cols_outcomes = cols[idx_issues:]
    else:
        cols_outcomes = []

    etudes = []
    for _, row in df.iterrows():
        traitements_evalues = [col for col in COLS_TRAITEMENTS_ETUDES if col in cols and row[col] != "-1"]
        criteres = {col: (row[col] if col in cols else "-1") for col in COLS_CRITERES}
        outcomes = {col: row[col] for col in cols_outcomes if row[col] != "-1"}

        etudes.append({
            "reference":           row[COL_REFERENCE]     if COL_REFERENCE     in cols else "-1",
            "objectif":            row[COL_OBJECTIF]      if COL_OBJECTIF      in cols else "-1",
            "niveau_preuve":       row[COL_NIVEAU_PREUVE] if COL_NIVEAU_PREUVE in cols else "-1",
            "traitements_evalues": traitements_evalues,
            "criteres":            criteres,
            "outcomes":            outcomes,
        })

    resultat = {"mapping": MAPPING, "etudes": etudes}
    with open(FICHIER_ETUDES, "w", encoding="utf-8") as f:
        json.dump(resultat, f, indent=4, ensure_ascii=False)
    print(f"✅  {FICHIER_ETUDES} généré ({len(etudes)} étude(s)).")

if __name__ == "__main__":
    generer_arbre(FICHIER_EXCEL)
    generer_base_etudes(FICHIER_EXCEL)

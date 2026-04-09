"""
convert_excel_to_json.py
────────────────────────
Convertit le fichier Excel maître du CDSS cancer du sein en deux fichiers JSON :
  • arbre_dynamique.json  – arbre de décision SENORIF (Feuille 0 "Arbre")
  • base_etudes.json      – base de la littérature scientifique (Feuille 1 "Etudes")

Dépendances : pandas, openpyxl
    pip install pandas openpyxl
"""

import pandas as pd
import json

# ═══════════════════════════════════════════════════════════════════
#  CONFIG  ── à adapter selon votre fichier Excel
# ═══════════════════════════════════════════════════════════════════
FICHIER_EXCEL     = "/TEST.xlsx"
FICHIER_ARBRE     = "arbre_dynamique.json"
FICHIER_ETUDES    = "base_etudes.json"

# ── Feuille 1 : colonnes fixes ───────────────────────────────────
COL_REFERENCE     = "Lien/ Référence études"
COL_OBJECTIF      = "Objectif de l'étude"
COL_NIVEAU_PREUVE = "Niveau de preuve"
COL_ISSUES        = "Issues"   # première colonne des outcomes (incluse)

COLS_CRITERES = [
    "T", "N", "RE", "RP", "HER2", "Grade",
    "Ki67 (%)", "Marges (mm)", "Age", "Emboles", "Triple N", "MCC",
]

COLS_TRAITEMENTS_ETUDES = [
    "Chirurgie mammaire", "Chirurgie axillaire", "RT",
    "CNA", "CT rattrapage", "CTadj", "Immunothérapie", "Hormonothérapie",
]

# Correspondance clés de l'arbre → clés des études (pour l'objet "mapping")
MAPPING = {
    "T":       "T",
    "N":       "N",
    "RE":      "RE",
    "RP":      "RP",
    "HER2":    "HER2",
    "Grade":   "Grade",
    "Ki67":    "Ki67 (%)",
    "Marges":  "Marges (mm)",
    "Age":     "Age",
    "Emboles": "Emboles",
    "TripleN": "Triple N",
    "MCC":     "MCC",
}

# ═══════════════════════════════════════════════════════════════════
#  NETTOYAGE UNIVERSEL
# ═══════════════════════════════════════════════════════════════════
_VALEURS_VIDES = {"-1", "-1.0", "nan", "NaN", "None", "NaT", ""}


def nettoyer_valeur(x) -> str:
    """
    Convertit toute valeur de cellule en chaîne propre :
      • NaN / None / vide / variantes de -1  →  "-1"
      • float entier (1.0, 0.0, -1.0)        →  "1", "0", "-1"
      • décimale utile (0.5)                 →  "0.5"
      • texte                                →  strip()
    """
    if x is None:
        return "-1"
    s = str(x).strip()
    if s in _VALEURS_VIDES:
        return "-1"
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except ValueError:
        return s


def nettoyer_df(df: pd.DataFrame) -> pd.DataFrame:
    """Applique nettoyer_valeur sur chaque cellule du DataFrame."""
    return df.apply(lambda col: col.map(nettoyer_valeur)).astype(str)


# ═══════════════════════════════════════════════════════════════════
#  MISSION 1 – arbre_dynamique.json
# ═══════════════════════════════════════════════════════════════════

def detecter_colonnes(df: pd.DataFrame):
    """
    Classe chaque colonne selon son préfixe :
      OUT_  → traitements (recommandations)
      INFO_ → informations annexes
      reste → questions de l'arbre
    """
    cols_q, cols_t, cols_i = [], [], []
    for col in df.columns:
        if   col.startswith("OUT_"):  cols_t.append(col)
        elif col.startswith("INFO_"): cols_i.append(col)
        else:                         cols_q.append(col)
    return cols_q, cols_t, cols_i


def creer_arbre(df_local: pd.DataFrame, liste_q: list, cols_t: list) -> dict:
    """
    Construction récursive de l'arbre de décision.
    Précondition : df_local est déjà entièrement nettoyé.

    Algorithme :
      1. Avancer jusqu'à la première question qui discrimine les lignes
         (au moins une valeur différente de "-1").
      2. Si aucune question utile ne reste → nœud feuille avec les OUT_.
      3. Sinon → nœud décision qui branche sur chaque valeur distincte.
    """
    while liste_q:
        question = liste_q[0]
        valeurs  = [v for v in df_local[question].unique() if v != "-1"]
        if valeurs:
            break
        liste_q = liste_q[1:]   # question sans valeur utile → ignorée
    else:
        # Plus aucune question utile → nœud feuille
        donnees = {
            col: (df_local[col].iloc[0] if len(df_local) > 0 else "-1")
            for col in cols_t
        }
        return {"type": "resultat", "donnees": donnees}

    noeud = {"type": "decision", "titre": question, "choix": {}}
    for val in valeurs:
        sous_df = df_local[df_local[question] == val]
        noeud["choix"][val] = creer_arbre(sous_df, liste_q[1:], cols_t)
    return noeud


def generer_arbre(fichier: str) -> None:
    df_raw = pd.read_excel(fichier, sheet_name=0)

    # Détection des rôles de colonnes sur les noms bruts (pas les valeurs)
    cols_q, cols_t, _ = detecter_colonnes(df_raw)

    # ✅ Nettoyage AVANT la construction de l'arbre (correction du bug d'origine)
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

    # ✅ Nettoyage universel dès le départ
    df = nettoyer_df(df_raw)
    cols = list(df.columns)

    # Colonnes outcomes : de COL_ISSUES jusqu'à la fin (inclus)
    if COL_ISSUES in cols:
        idx_issues    = cols.index(COL_ISSUES)
        cols_outcomes = cols[idx_issues:]
    else:
        cols_outcomes = []
        print(f"⚠️  Colonne '{COL_ISSUES}' introuvable – aucun outcome extrait.")

    etudes = []
    for _, row in df.iterrows():

        # ── Traitements évalués ──────────────────────────────────
        traitements_evalues = [
            col for col in COLS_TRAITEMENTS_ETUDES
            if col in cols and row[col] != "-1"
        ]

        # ── Critères ────────────────────────────────────────────
        criteres = {
            col: (row[col] if col in cols else "-1")
            for col in COLS_CRITERES
        }

        # ── Outcomes (uniquement les clés avec une valeur réelle) ─
        outcomes = {
            col: row[col]
            for col in cols_outcomes
            if row[col] != "-1"
        }

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


# ═══════════════════════════════════════════════════════════════════
#  POINT D'ENTRÉE
# ═══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    generer_arbre(FICHIER_EXCEL)
    generer_base_etudes(FICHIER_EXCEL)

# Taxonomy Fixture Sources

## DE/EN Draft Source Rules

This file records the source trail for `taxonomy.de.json` and
`taxonomy.en.json`. The draft follows `docs/methodology-pack.md` as the
canonical source for codes and approved default labels. Category examples
come from the legacy extracted taxonomy because the methodology pack names
`legacy docs/hazard_taxonomy.md` as
the source for representative category examples.

the maintainer's 2026-05-06 decision resolved the previously blocked DE labels for
severity, likelihood, risk bands, and S-T-O-P. The decision is recorded on
the `ssfw-10l` bead. Likelihood labels and anchors follow SUVA's collective
estimate framing: imagine 1000 people doing the same task under similar
conditions.

## DE Entry Citations

| Section | Code | Draft DE label | Citation | Source note |
| --- | --- | --- | --- | --- |
| categories | `MECHANICAL` | Mechanische Gefährdungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §1 | Label from pack; examples from legacy taxonomy. |
| categories | `FALLS` | Sturzgefährdungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §2 | Label from pack; examples from legacy taxonomy. |
| categories | `ELECTRICAL` | Elektrische Gefährdungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §3 | Label from pack; examples from legacy taxonomy. |
| categories | `HAZARDOUS_SUBSTANCES` | Gesundheitsgefährdende Stoffe (chemisch / biologisch) | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §4 | Label from pack; examples from legacy taxonomy. |
| categories | `FIRE_EXPLOSION` | Brand- und Explosionsgefährdungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §5 | Label from pack; examples from legacy taxonomy. |
| categories | `THERMAL` | Thermische Gefährdungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §6 | Label from pack; examples from legacy taxonomy. |
| categories | `PHYSICAL_AGENTS` | Spezielle physikalische Belastungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §7 | Label from pack; examples from legacy taxonomy. |
| categories | `ENVIRONMENTAL` | Belastungen durch Arbeitsumgebungsbedingungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §8 | Label from pack; examples from legacy taxonomy. |
| categories | `MUSCULOSKELETAL` | Belastungen am Bewegungsapparat | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §9 | Label from pack; examples from legacy taxonomy. |
| categories | `PSYCHOSOCIAL` | Psychische Belastungen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §10 | Label from pack; examples from legacy taxonomy. |
| categories | `UNEXPECTED_ACTIONS` | Unerwartete Aktionen | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §11 | Label from pack; examples from legacy taxonomy. |
| categories | `WORK_ORGANISATION` | Arbeitsorganisation | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §12 | Label from pack; examples from legacy taxonomy. |
| severity | `A` | Tod | `docs/methodology-pack.md#severity-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 3 | maintainer-approved DE label aligned to EN severity semantics; source table uses `Tod`. |
| severity | `B` | Irreversibler Gesundheitsschaden | `docs/methodology-pack.md#severity-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 3 | maintainer-approved DE label aligned to EN severity semantics; source table uses bleibender Gesundheitsschaden. |
| severity | `C` | Verletzung mit Arbeitsausfall | `docs/methodology-pack.md#severity-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 3 | maintainer-approved DE label aligned to EN severity semantics. |
| severity | `D` | Medizinische Behandlung | `docs/methodology-pack.md#severity-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 3 | maintainer-approved DE label aligned to EN severity semantics. |
| severity | `E` | Erste Hilfe | `docs/methodology-pack.md#severity-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 3 | maintainer-approved DE label aligned to EN severity semantics. |
| likelihood | `1` | Häufig | `docs/methodology-pack.md#likelihood-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 4/5 | SUVA label; 1000-person collective estimate guidance retained. |
| likelihood | `2` | Gelegentlich | `docs/methodology-pack.md#likelihood-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 4/5 | SUVA label; 1000-person collective estimate guidance retained. |
| likelihood | `3` | Selten | `docs/methodology-pack.md#likelihood-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 4/5 | SUVA label; 1000-person collective estimate guidance retained. |
| likelihood | `4` | Unwahrscheinlich | `docs/methodology-pack.md#likelihood-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 4/5 | SUVA label; 1000-person collective estimate guidance retained. |
| likelihood | `5` | Praktisch unmöglich | `docs/methodology-pack.md#likelihood-anchors`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 20, Tabelle 4/5 | SUVA label; 1000-person collective estimate guidance retained. |
| riskBands | `HIGH` | Höheres Risiko | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved default wording. |
| riskBands | `MEDIUM` | Mittleres Risiko | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved default wording. |
| riskBands | `LOW` | Tieferes Risiko | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved default wording. |
| controlHierarchy | `SUBSTITUTION` | Substitution | `docs/methodology-pack.md#s-t-o-p-control-hierarchy`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 27, §11.1 | Existing label kept per maintainer decision. |
| controlHierarchy | `TECHNICAL` | Technische Massnahmen | `docs/methodology-pack.md#s-t-o-p-control-hierarchy`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 27, §11.1 | Existing label kept per maintainer decision. |
| controlHierarchy | `ORGANIZATIONAL` | Organisatorische Massnahmen | `docs/methodology-pack.md#s-t-o-p-control-hierarchy`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 27, §11.1 | Existing label kept per maintainer decision. |
| controlHierarchy | `PPE` | Personenbezogene Massnahmen | `docs/methodology-pack.md#s-t-o-p-control-hierarchy`; `SUVA 66099_D (Gefährdungsermittlung)`, p. 27, §11.1 | Existing label kept per maintainer decision. |

## EN Entry Citations

| Section | Code | Draft EN label | Citation | Source note |
| --- | --- | --- | --- | --- |
| categories | `MECHANICAL` | Mechanical hazards | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §1 | Label from pack; examples from legacy taxonomy. |
| categories | `FALLS` | Fall hazards | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §2 | Label from pack; examples from legacy taxonomy. |
| categories | `ELECTRICAL` | Electrical hazards | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §3 | Label from pack; examples from legacy taxonomy. |
| categories | `HAZARDOUS_SUBSTANCES` | Harmful substances (chemical / biological) | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §4 | Label from pack; examples from legacy taxonomy. |
| categories | `FIRE_EXPLOSION` | Fire and explosion hazards | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §5 | Label from pack; examples from legacy taxonomy. |
| categories | `THERMAL` | Thermal hazards | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §6 | Label from pack; examples from legacy taxonomy. |
| categories | `PHYSICAL_AGENTS` | Specific physical agents | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §7 | Label from pack; examples from legacy taxonomy. |
| categories | `ENVIRONMENTAL` | Environmental conditions | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §8 | Label from pack; examples from legacy taxonomy. |
| categories | `MUSCULOSKELETAL` | Musculoskeletal strain | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §9 | Label from pack; examples from legacy taxonomy. |
| categories | `PSYCHOSOCIAL` | Psychosocial strain | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §10 | Label from pack; examples from legacy taxonomy. |
| categories | `UNEXPECTED_ACTIONS` | Unexpected actions (control / power failures) | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §11 | Label from pack; examples from legacy taxonomy. |
| categories | `WORK_ORGANISATION` | Work organisation | `docs/methodology-pack.md#hazard-taxonomy-canonical`; `legacy docs/hazard_taxonomy.md`, §12 | Label from pack; examples from legacy taxonomy. |
| severity | `A` | Death | `docs/methodology-pack.md#severity-anchors` | Pack label. |
| severity | `B` | Irreversible injury | `docs/methodology-pack.md#severity-anchors` | Pack label. |
| severity | `C` | Lost time injury | `docs/methodology-pack.md#severity-anchors` | Pack label. |
| severity | `D` | Medical treatment | `docs/methodology-pack.md#severity-anchors` | Pack label. |
| severity | `E` | First aid | `docs/methodology-pack.md#severity-anchors` | Pack label. |
| likelihood | `1` | Frequent | `docs/methodology-pack.md#likelihood-anchors`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved EN label; 1000-person collective estimate guidance retained. |
| likelihood | `2` | Occasional | `docs/methodology-pack.md#likelihood-anchors`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved EN label; 1000-person collective estimate guidance retained. |
| likelihood | `3` | Rare | `docs/methodology-pack.md#likelihood-anchors`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved EN label; 1000-person collective estimate guidance retained. |
| likelihood | `4` | Unlikely | `docs/methodology-pack.md#likelihood-anchors`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved EN label; 1000-person collective estimate guidance retained. |
| likelihood | `5` | Practically impossible | `docs/methodology-pack.md#likelihood-anchors`; `ssfw-10l` maintainer decision, 2026-05-06 | maintainer-approved EN label; 1000-person collective estimate guidance retained. |
| riskBands | `HIGH` | Higher risk | `docs/methodology-pack.md#risk-matrix-5--5` | Pack label. |
| riskBands | `MEDIUM` | Medium risk | `docs/methodology-pack.md#risk-matrix-5--5` | Pack label. |
| riskBands | `LOW` | Lower risk | `docs/methodology-pack.md#risk-matrix-5--5` | Pack label. |
| controlHierarchy | `SUBSTITUTION` | Substitution | `docs/methodology-pack.md#s-t-o-p-control-hierarchy` | Pack label. |
| controlHierarchy | `TECHNICAL` | Technical | `docs/methodology-pack.md#s-t-o-p-control-hierarchy` | Pack label. |
| controlHierarchy | `ORGANIZATIONAL` | Organisational | `docs/methodology-pack.md#s-t-o-p-control-hierarchy` | Pack label. |
| controlHierarchy | `PPE` | PPE | `docs/methodology-pack.md#s-t-o-p-control-hierarchy` | Pack label. |

## IT Source Rules

This file records the source trail for `taxonomy.it.json`. The fixture uses
the Italian SUVA sources listed in ADR-0003 D9 and
`docs/methodology-pack.md` source provenance:

- `SUVA: 66105_i.pdf`
- `SUVA: 66099_I_Original_28047.pdf`
- `SUVA: vorlage-risikobeurteilung_it_Original_it_23487.doc`

Code stability is checked against the canonical arrays in
`src/lib/taxonomy/schema.ts` and, where available, the four locale
fixtures `taxonomy.{de,en,fr,it}.json`.

The SUVA category table in `66105_i.pdf` has 13 numbered rows. This
fixture uses the 12 canonical methodology codes and intentionally omits
source row 12, `Guasti nell'alimentazione energetica`, because no
corresponding canonical code exists in `docs/methodology-pack.md`.

Severity codes A-E are schema/methodology IDs. After the maintainer's 2026-05-06
decision, severity labels are aligned to the approved DE/EN semantics
rather than mapped mechanically to every SUVA I-V wording. Likelihood
codes 1-5 retain SUVA probability labels and use the shared 1000-person
collective-estimate anchors. Risk-band codes HIGH/MEDIUM/LOW use the
shared default wording and remain configurable later per company.

No IT label below is marked `NEEDS OLIVER REVIEW` for missing SUVA
terminology. the maintainer's 2026-05-06 alignment decision is recorded in
`ssfw-ih4` and in the control-repo evidence directory.

## IT Entry Citations

| Section | Code | Draft IT label | Citation | Source note |
| --- | --- | --- | --- | --- |
| categories | `MECHANICAL` | Pericoli di natura meccanica | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 1 | Exact row label. |
| categories | `FALLS` | Pericolo di caduta | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 2 | Exact row label. |
| categories | `ELECTRICAL` | Pericoli di natura elettrica | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 3 | Exact row label. |
| categories | `HAZARDOUS_SUBSTANCES` | Sostanze nocive (chimiche / biologiche) | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 4 | Exact row label. |
| categories | `FIRE_EXPLOSION` | Pericoli di incendio e di esplosione | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 5 | Exact row label. |
| categories | `THERMAL` | Pericoli di natura termica | `SUVA: 66105_i.pdf`, p. 15, Appendice 3, row 6 | Exact row label. |
| categories | `PHYSICAL_AGENTS` | Sollecitazioni fisiche particolari | `SUVA: 66105_i.pdf`, p. 16, Appendice 3, row 7 | Exact row label. |
| categories | `ENVIRONMENTAL` | Sollecitazioni dovute a condizioni ambientali | `SUVA: 66105_i.pdf`, p. 16, Appendice 3, row 8 | Exact row label. |
| categories | `MUSCULOSKELETAL` | Sollecitazione all'apparato locomotore | `SUVA: 66105_i.pdf`, p. 16, Appendice 3, row 9 | Exact row label. |
| categories | `PSYCHOSOCIAL` | Sollecitazioni psichiche | `SUVA: 66105_i.pdf`, p. 16, Appendice 3, row 10 | Exact row label. |
| categories | `UNEXPECTED_ACTIONS` | Azioni inaspettate | `SUVA: 66105_i.pdf`, p. 17, Appendice 3, row 11 | Exact row label. |
| categories | `WORK_ORGANISATION` | Organizzazione del lavoro | `SUVA: 66105_i.pdf`, p. 17, Appendice 3, row 13 | Exact row label. |
| severity | `A` | Decesso | `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 3 | SUVA level I, mapped by rank to schema code A; anchor aligned to the accepted default: fatal injury or multiple severe injuries. |
| severity | `B` | Danno irreversibile alla salute | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `C` | Infortunio con assenza dal lavoro | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `D` | Trattamento medico | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `E` | Primo soccorso | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| likelihood | `1` | Frequente | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 4; p. 21, Tabella 5 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `2` | Occasionale | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 4; p. 21, Tabella 5 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `3` | Rara | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 4; p. 21, Tabella 5 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `4` | Improbabile | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 4; p. 21, Tabella 5 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `5` | Quasi impossibile | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_I_Original_28047.pdf`, p. 20, Tabella 4; p. 21, Tabella 5 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| riskBands | `HIGH` | Rischio più elevato | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| riskBands | `MEDIUM` | Rischio medio | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| riskBands | `LOW` | Rischio più basso | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| controlHierarchy | `SUBSTITUTION` | Sostituzione | `SUVA: 66099_I_Original_28047.pdf`, p. 28, section 11.1 | Exact S label. |
| controlHierarchy | `TECHNICAL` | Misure tecniche | `SUVA: 66099_I_Original_28047.pdf`, p. 28, section 11.1 | Exact T label. |
| controlHierarchy | `ORGANIZATIONAL` | Misure organizzative | `SUVA: 66099_I_Original_28047.pdf`, p. 28, section 11.1 | Exact O label. |
| controlHierarchy | `PPE` | Misure personali | `SUVA: 66099_I_Original_28047.pdf`, p. 28, section 11.1 | Exact P label; examples include dispositivi di protezione individuale. |

## FR Source Rules

This file records the source trail for `taxonomy.fr.json`. The draft follows
`SUVA: SUVA_FR_GLOSSARY.md`: it uses
SUVA's own French terminology, uses `phénomènes dangereux` for the 66099/66105
risk-method context, and does not use the mixed BO.538/BO.539/PR.537 PPTX files
as primary sources.

Code stability is checked against the canonical arrays in
`src/lib/taxonomy/schema.ts`, the methodology pack, and the available
locale fixtures.

The SUVA category table in `66105_f.pdf` has 13 numbered rows. This fixture uses
the 12 canonical methodology codes and intentionally omits source row 12,
`Défaillance de l'alimentation en énergie`, because no corresponding canonical
code exists in `docs/methodology-pack.md`.

Severity codes A-E are schema/methodology IDs. After the maintainer's 2026-05-06
decision, severity labels are aligned to the approved DE/EN semantics
rather than mapped mechanically to every SUVA I-V wording. Likelihood
codes 1-5 retain SUVA probability labels and use the shared 1000-person
collective-estimate anchors. Risk-band codes HIGH/MEDIUM/LOW use the
shared default wording and remain configurable later per company.

No FR label below is marked `NEEDS OLIVER REVIEW` for missing SUVA terminology.
the maintainer's 2026-05-06 alignment decision is recorded in `ssfw-ih4` and in
the control-repo evidence directory.

## FR Entry Citations

| Section | Code | Draft FR label | Citation | Source note |
| --- | --- | --- | --- | --- |
| categories | `MECHANICAL` | Phénomènes dangereux mécaniques | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 1 | Exact row label. |
| categories | `FALLS` | Phénomènes dangereux de chute | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 2 | Exact row label. |
| categories | `ELECTRICAL` | Phénomènes dangereux électriques | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 3 | Exact row label. |
| categories | `HAZARDOUS_SUBSTANCES` | Substances nocives (chimiques, biologiques) | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 4 | Exact row label. |
| categories | `FIRE_EXPLOSION` | Substances inflammables ou explosives | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 5 | Exact row label. |
| categories | `THERMAL` | Phénomènes dangereux thermiques | `SUVA: 66105_f.pdf`, p. 15, Annexe 3, row 6 | Exact row label. |
| categories | `PHYSICAL_AGENTS` | Contraintes physiques particulières | `SUVA: 66105_f.pdf`, p. 16, Annexe 3, row 7 | Exact row label. |
| categories | `ENVIRONMENTAL` | Contraintes liées à l'environnement de travail | `SUVA: 66105_f.pdf`, p. 16, Annexe 3, row 8 | Exact row label. |
| categories | `MUSCULOSKELETAL` | Contraintes exercées sur l'appareil locomoteur | `SUVA: 66105_f.pdf`, p. 16, Annexe 3, row 9 | Exact row label. |
| categories | `PSYCHOSOCIAL` | Contraintes psychiques | `SUVA: 66105_f.pdf`, p. 17, Annexe 3, row 10 | Exact row label. |
| categories | `UNEXPECTED_ACTIONS` | Actions inattendues | `SUVA: 66105_f.pdf`, p. 17, Annexe 3, row 11 | Exact row label. |
| categories | `WORK_ORGANISATION` | Organisation du travail | `SUVA: 66105_f.pdf`, p. 17, Annexe 3, row 13 | Exact row label. |
| severity | `A` | Décès | `SUVA: 66099_F_Original_28213.pdf`, p. 13, Tableau 2 | SUVA category I, mapped by rank to schema code A; anchor aligned to the accepted default: fatal injury or multiple severe injuries. |
| severity | `B` | Atteinte irréversible à la santé | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `C` | Blessure avec arrêt de travail | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `D` | Traitement médical | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| severity | `E` | Premiers secours | `docs/methodology-pack.md#severity-anchors`; `ssfw-ih4` maintainer decision, 2026-05-06 | Aligned to accepted EN/DE severity semantics. |
| likelihood | `1` | Fréquent | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_F_Original_28213.pdf`, p. 15, Tableau 8 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `2` | Occasionnel | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_F_Original_28213.pdf`, p. 15, Tableau 8 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `3` | Rare | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_F_Original_28213.pdf`, p. 15, Tableau 8 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `4` | Improbable | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_F_Original_28213.pdf`, p. 15, Tableau 8 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| likelihood | `5` | Quasi impossible | `docs/methodology-pack.md#likelihood-anchors`; `SUVA: 66099_F_Original_28213.pdf`, p. 15, Tableau 8 | SUVA probability label retained; 1000-person collective estimate guidance aligned to EN/DE. |
| riskBands | `HIGH` | Risque plus élevé | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| riskBands | `MEDIUM` | Risque moyen | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| riskBands | `LOW` | Risque plus faible | `docs/methodology-pack.md#risk-matrix-5--5`; `ssfw-ih4` maintainer decision, 2026-05-06 | Default wording aligned to EN/DE; company-specific wording remains configurable later. |
| controlHierarchy | `SUBSTITUTION` | Remplacement de procédés et de substances dangereux | `SUVA: 66099_F_Original_28213.pdf`, p. 18, Illustration 8 | Figure label for removing the hazard by replacement. |
| controlHierarchy | `TECHNICAL` | Mesures techniques de protection | `SUVA: 66099_F_Original_28213.pdf`, p. 19, section 5, item b | Exact item label. |
| controlHierarchy | `ORGANIZATIONAL` | Mesures organisationnelles | `SUVA: 66099_F_Original_28213.pdf`, p. 19, section 5, item c | Exact item label. |
| controlHierarchy | `PPE` | Mesures relatives aux personnes | `SUVA: 66099_F_Original_28213.pdf`, p. 19, section 5, item d | Exact item label; the parenthetical includes `équipements de protection individuelle`. |

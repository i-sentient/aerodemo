# The Journey — naming

Shared vocabulary for the Sentient Hospital walkthrough: one patient
(Chandrababu · ICU-08 · anterior STEMI), one continuous ride, one app
(`localhost:5210`). Use these names in conversation, commits, and code.

## The ride, in order

```
ER → Ward Manager → Patient Workup Manager → [Cath Lab] → Post Cath Manager → [OR] → Post-Op Manager
```

| Name | What it is | code |
|---|---|---|
| **ER** | the round ER drum — first dive-in room | `RoundERLab` / view `er` |
| **Ward Manager** | ward view: ICU floor + agents (whole-ward, macro) | `?chapter=workup`, ward phase (`WardApp`) |
| **Patient Workup Manager** | patient hub: the STEMI workup | `?chapter=workup`, tars phase |
| *(Cath Lab)* | diagnostic angiogram room — dive between | `CathLabScene` |
| **Post Cath Manager** | patient hub: the PTCA vs CABG decision | `?chapter=continued` |
| *(OR)* | operating theatre room — dive between | `ORScene` |
| **Post-Op Manager** | patient hub: post-surgery (Scene 4, WIP) | `?chapter=postop` |

## Two interface types

- **Ward Manager** — the **2-split** ward view: **ICU Floor** (left) + **Agent Panel** (right).
- **Patient Manager** — the **3-split** patient hub. Three states, chosen by `?chapter=`:
  **Workup** (`workup`) → **Post Cath** (`continued`) → **Post-Op** (`postop`).

The "Managers" are interface *instances*. The rooms below are the 3D scenes you
dive *through* between them.

## The rooms (3D dive-through scenes)

- **The Tower** — the hospital exterior you dive through (`BuildingStack`)
- **ER** (`RoundERLab`) · **Cath Lab** (`CathLabScene`) · **OR** (`ORScene`)
- **The Dive** — the transition itself: out of a room → tower reveal → plunge into the next tier.

## The panels (inside a Manager)

| | Name | Holds |
|---|---|---|
| **Panel A** | **Bedside Console** | body twin · vitals · **Devices Rail** · ECG · **VISION** camera-twin. *(In the Ward Manager this same panel is the **ICU Floor**.)* |
| **Panel B** | **Agent Panel** | agents up top (**LSam** · **iSAM** · **TARS**), humans in the bottom chin (**Clinician** · **Nurse**); chat feed, order cards, **Decision card** |
| **Panel C** | **Clinical Apps** | the dock: Summary · Vitals · LIS · e-MAR · Referrals · PACS · Notes · Case |
| top | **Identity Bar** | patient · ward-back button · care team |

## The agents (already named)

- **LSam** — sensing · **iSAM** — reasoning · **TARS** — orchestration
- **Clinician** / **Nurse** — the human gates

# Starter library: draft for Nathan's review

17 November 2026 · Phase 1 · Status: **draft, awaiting Nathan's review**

Every new account starts with these 42 exercises and the starter vocabulary. This page is made from `data/starter-library.json`, which is the copy the app actually uses. To change anything, tell the coding agent, or edit the file and ask for this page to be remade.

## What to check

- Are these the right exercises to start everyone with? Anything to add or drop?
- Is each one under the right muscle group and focus?
- Are the three alternates sensible: bodyweight (no equipment), basic gym (dumbbells, bands, barbell) and full gym (machines and cables)?
- Work and rest seconds: every exercise has 45 seconds of work per set. Rest is 120 seconds for multi-joint lifts and 90 for single-joint, the spec's defaults (Section 9, row 3). These have no researched source yet (row 14).
- Rows marked with a note in the last column are ones I was unsure of.

Names follow the coach naming rule: equipment, then variation, then movement. Units are pounds for weighted lifts and bodyweight (BW) for bodyweight ones. When an alternate's name matches another starter exercise, the app links the two, so a swap uses that exercise's own history.

## Exercises


### Chest

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Bench Press | mid | barbell | lb | 120 | Bodyweight Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press |  |
| Dumbbell Bench Press | mid | dumbbell | lb | 120 | Bodyweight Push-Up | Barbell Bench Press | Selectorized Machine Chest Press |  |
| Dumbbell Incline Press | upper | dumbbell | lb | 120 | Bodyweight Feet-Elevated Push-Up | Barbell Incline Bench Press | Smith Machine Incline Press |  |
| Cable Standing Fly | mid | cable | lb | 90 | Bodyweight Wide Push-Up | Dumbbell Fly | Selectorized Machine Pec Deck |  |
| Bodyweight Push-Up | mid | bodyweight | bw | 120 | Bodyweight Incline Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press | Multi-joint, so 120 s rest by the default rule. May feel long for push-ups. |
| Bodyweight Dip | lower | bodyweight | bw | 120 | Bodyweight Incline Push-Up | Dumbbell Decline Press | Selectorized Machine Assisted Dip |  |

### Back

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Bodyweight Pull-Up | lats | bodyweight | bw | 120 | Bodyweight Chin-Up | Dumbbell Pullover | Cable Lat Pulldown |  |
| Cable Lat Pulldown | lats | cable | lb | 120 | Bodyweight Pull-Up | Dumbbell Pullover | Plate-Loaded Machine Lat Pulldown |  |
| Barbell Bent-Over Row | mid back | barbell | lb | 120 | Bodyweight Inverted Row | Dumbbell One-Arm Row | Cable Seated Row |  |
| Dumbbell One-Arm Row | lats | dumbbell | lb | 120 | Bodyweight Inverted Row | Barbell Bent-Over Row | Selectorized Machine Seated Row |  |
| Cable Seated Row | mid back | cable | lb | 120 | Bodyweight Inverted Row | Dumbbell Chest-Supported Row | Plate-Loaded Machine Row |  |
| Barbell Deadlift | lower back | barbell | lb | 120 | Bodyweight Back Extension | Kettlebell Deadlift | Selectorized Machine Back Extension | Filed under Back, lower back. Could equally sit under Hamstrings or Glutes. |

### Shoulders

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Overhead Press | front | barbell | lb | 120 | Bodyweight Pike Push-Up | Dumbbell Shoulder Press | Selectorized Machine Shoulder Press |  |
| Dumbbell Shoulder Press | front | dumbbell | lb | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press |  |
| Dumbbell Lateral Raise | side | dumbbell | lb | 90 | Bodyweight Pike Push-Up | Band Lateral Raise | Cable Lateral Raise | No true bodyweight side-delt movement exists. The pike push-up is the closest general shoulder option. |
| Cable Face Pull | rear | cable | lb | 90 | Bodyweight Prone Y-T-W Raise | Band Pull-Apart | Selectorized Machine Reverse Pec Deck |  |

### Biceps

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Curl | short head | barbell | lb | 90 | Bodyweight Chin-Up | Dumbbell Curl | Cable Curl |  |
| Dumbbell Incline Curl | long head | dumbbell | lb | 90 | Bodyweight Chin-Up | Band Curl | Cable Bayesian Curl |  |
| Dumbbell Hammer Curl | brachialis | dumbbell | lb | 90 | Bodyweight Towel Curl | Band Hammer Curl | Cable Rope Hammer Curl | The towel curl is a weak bodyweight stand-in. Consider whether a chin-up is better here. |
| Selectorized Machine Preacher Curl | short head | selectorized machine | lb | 90 | Bodyweight Chin-Up | Dumbbell Preacher Curl | Cable Preacher Curl |  |

### Triceps

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Cable Rope Pushdown | lateral head | cable | lb | 90 | Bodyweight Bench Dip | Band Pushdown | Selectorized Machine Triceps Extension |  |
| Cable Overhead Triceps Extension | long head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Overhead Triceps Extension | Selectorized Machine Overhead Triceps Extension | The spec's own naming example. |
| Barbell Close-Grip Bench Press | medial head | barbell | lb | 120 | Bodyweight Diamond Push-Up | Dumbbell Close-Grip Press | Smith Machine Close-Grip Bench Press |  |
| Dumbbell Skull Crusher | long head | dumbbell | lb | 90 | Bodyweight Bar Triceps Extension | Barbell Skull Crusher | Cable Overhead Triceps Extension |  |

### Forearms

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Dumbbell Wrist Curl | flexors | dumbbell | lb | 90 | Bodyweight Towel Hang | Barbell Wrist Curl | Cable Wrist Curl | The towel hang is timed, not counted in reps. Flagged for your review. |
| Barbell Reverse Curl | extensors | barbell | lb | 90 | Bodyweight Pull-Up | Dumbbell Reverse Curl | Cable Reverse Curl | A pull-up is only a loose bodyweight stand-in for the forearm extensors. |

### Core

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Cable Kneeling Crunch | abs | cable | lb | 90 | Bodyweight Crunch | Dumbbell Weighted Crunch | Selectorized Machine Ab Crunch |  |
| Bodyweight Hanging Knee Raise | abs | bodyweight | bw | 90 | Bodyweight Reverse Crunch | Dumbbell Lying Leg Raise | Cable Reverse Crunch |  |
| Cable Pallof Press | deep core | cable | lb | 90 | Bodyweight Dead Bug | Band Pallof Press | Selectorized Machine Ab Crunch | The full-gym alternate trains abs more than deep core. No machine targets deep core well. |
| Cable Woodchop | obliques | cable | lb | 90 | Bodyweight Russian Twist | Dumbbell Side Bend | Selectorized Machine Rotary Torso |  |

### Glutes

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Hip Thrust | max | barbell | lb | 120 | Bodyweight Glute Bridge | Dumbbell Hip Thrust | Plate-Loaded Machine Hip Thrust |  |
| Kettlebell Swing | max | kettlebell | lb | 120 | Bodyweight Glute Bridge | Dumbbell Swing | Cable Pull-Through |  |

### Quads

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Back Squat | - | barbell | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Hack Squat |  |
| Plate-Loaded Machine Leg Press | - | plate-loaded machine | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Hack Squat |  |
| Dumbbell Bulgarian Split Squat | - | dumbbell | lb | 120 | Bodyweight Split Squat | Dumbbell Reverse Lunge | Smith Machine Split Squat | Weight is per dumbbell or total. Worth deciding how you will enter it. |
| Selectorized Machine Leg Extension | - | selectorized machine | lb | 90 | Bodyweight Sissy Squat | Band Leg Extension | Cable Leg Extension |  |

### Hamstrings

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Romanian Deadlift | - | barbell | lb | 120 | Bodyweight Single-Leg Romanian Deadlift | Dumbbell Romanian Deadlift | Smith Machine Romanian Deadlift |  |
| Selectorized Machine Seated Leg Curl | - | selectorized machine | lb | 90 | Bodyweight Nordic Curl | Dumbbell Lying Leg Curl | Selectorized Machine Lying Leg Curl |  |

### Calves

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Standing Calf Raise | gastrocnemius | selectorized machine | lb | 90 | Bodyweight Single-Leg Calf Raise | Dumbbell Standing Calf Raise | Smith Machine Calf Raise |  |
| Selectorized Machine Seated Calf Raise | soleus | selectorized machine | lb | 90 | Bodyweight Bent-Knee Calf Raise | Dumbbell Seated Calf Raise | Plate-Loaded Machine Seated Calf Raise |  |

### Adductors

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Hip Adduction | - | selectorized machine | lb | 90 | Bodyweight Side-Lying Adduction | Band Hip Adduction | Cable Standing Hip Adduction |  |

### Abductors

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight alternate | Basic gym alternate | Full gym alternate | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Hip Abduction | - | selectorized machine | lb | 90 | Bodyweight Side-Lying Leg Raise | Band Lateral Walk | Cable Standing Hip Abduction | Also trains Glutes, medius. |

## Starter vocabulary

| Muscle group | Focus values |
|---|---|
| Chest | upper, mid, lower |
| Back | lats, upper back, mid back, lower back |
| Shoulders | front, side, rear |
| Biceps | long head, short head, brachialis |
| Triceps | long head, lateral head, medial head |
| Forearms | flexors, extensors, grip |
| Core | abs, obliques, deep core |
| Glutes | max, medius |
| Calves | gastrocnemius, soleus |
| Quads | none to start |
| Hamstrings | none to start |
| Adductors | none to start |
| Abductors | none to start |

Equipment: barbell, dumbbell, kettlebell, cable, selectorized machine, plate-loaded machine, Smith machine, bodyweight, band, cardio machine.

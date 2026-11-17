# Starter library

Version 2 · 227 exercises · Status: **approved by Nathan, 17 November 2026**

Every new account starts with these exercises and the starter vocabulary. This page is made from `data/starter-library.json`, which is the copy the app actually uses, by `node scripts/build-starter-library-doc.mjs`. Do not edit this page by hand: change the data file and remake the page.

## History

- **Version 1** (17 November 2026): 42 exercises drafted by the coding agent in Phase 1.
- **Version 2** (17 November 2026): an outside coach reviewed version 1, kept all 42, edited 19 of them (swaps, form notes, the leg press renamed "Plate-Loaded Machine Angled Leg Press", the barbell reverse curl filed under Biceps) and added 185. The coding agent then made 14 rest times consistent with the default rule; muscle groups and focus are as the coach set them. Nathan approved it for every account. Accounts made with version 1 are brought up to version 2 by `supabase/migrations/20261117000600_starter_library_v2.sql`.

## How it is put together

- Names follow the coach naming rule: equipment, then variation, then movement.
- Units are pounds for weighted lifts and bodyweight (BW) for bodyweight ones.
- Work is 45 seconds per set for every exercise. Rest is 120 seconds for multi-joint lifts and 90 for single-joint and core work, the spec's defaults (Section 9, row 3). These have no researched source yet (row 14).
- Every exercise has three swaps: bodyweight (your own weight, may use a fixed bar or a stable bench), basic gym (dumbbells, bands, barbell, kettlebell) and full gym (machines and cables). Every swap is itself an exercise in this library, so the app links the two and a swap uses that exercise's own history.
- By equipment: bodyweight 53, dumbbell 42, cable 39, selectorized machine 25, plate-loaded machine 23, barbell 18, band 14, Smith machine 10, kettlebell 3.

## Logging conventions from the coach

These are in the exercises' notes. Nathan decided on 17 November 2026 how records and totals treat them (spec Section 3, design Section 10E point 9). The changes to the data arrive at the start of Phase 2.

- **Dumbbells:** log pounds per dumbbell, and reps per side for one-sided lifts. Records use the single-dumbbell weight. Each exercise gets a load count (2 for a pair or per side) so volume is the total weight moved.
- **Assisted machines** (assisted dip, assisted pull-up): log the machine's assistance. More assistance makes the rep easier, so progress shows as the number going down. Records count less assistance as better, and volume counts reps.
- **Sleds:** log the added plates, and count one fixed-distance trip as one rep. No special rule: a sled is a lift over a longer distance.
- **Bands:** treated as bodyweight, because band resistance is not standardized or labeled. Use the same band and setup each time. The 14 band exercises below still show pounds until Phase 2 switches them to BW.

## Exercises

### Chest (22)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Dumbbell Incline Press | upper | dumbbell | lb | 120 | Bodyweight Feet-Elevated Push-Up | Barbell Incline Bench Press | Smith Machine Incline Press |  |
| Bodyweight Feet-Elevated Push-Up | upper | bodyweight | bw | 120 | Bodyweight Push-Up | Dumbbell Incline Press | Plate-Loaded Machine Incline Chest Press | Use a stable bench for your feet. |
| Barbell Incline Bench Press | upper | barbell | lb | 120 | Bodyweight Feet-Elevated Push-Up | Dumbbell Incline Press | Plate-Loaded Machine Incline Chest Press |  |
| Plate-Loaded Machine Incline Chest Press | upper | plate-loaded machine | lb | 120 | Bodyweight Feet-Elevated Push-Up | Dumbbell Incline Press | Smith Machine Incline Press | Set the seat so the handles start near your upper chest. |
| Smith Machine Incline Press | upper | Smith machine | lb | 120 | Bodyweight Feet-Elevated Push-Up | Dumbbell Incline Press | Plate-Loaded Machine Incline Chest Press |  |
| Barbell Bench Press | mid | barbell | lb | 120 | Bodyweight Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press |  |
| Dumbbell Bench Press | mid | dumbbell | lb | 120 | Bodyweight Push-Up | Barbell Bench Press | Selectorized Machine Chest Press |  |
| Cable Standing Fly | mid | cable | lb | 90 | Bodyweight Wide Push-Up | Dumbbell Fly | Selectorized Machine Pec Deck |  |
| Bodyweight Push-Up | mid | bodyweight | bw | 120 | Bodyweight Incline Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press |  |
| Bodyweight Incline Push-Up | mid | bodyweight | bw | 120 | Bodyweight Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press | Use a stable bench or fixed bar. |
| Selectorized Machine Chest Press | mid | selectorized machine | lb | 120 | Bodyweight Push-Up | Barbell Bench Press | Smith Machine Bench Press |  |
| Smith Machine Bench Press | mid | Smith machine | lb | 120 | Bodyweight Push-Up | Barbell Bench Press | Selectorized Machine Chest Press | Set the safeties before you start. |
| Bodyweight Wide Push-Up | mid | bodyweight | bw | 120 | Bodyweight Push-Up | Dumbbell Fly | Cable Standing Fly |  |
| Dumbbell Fly | mid | dumbbell | lb | 90 | Bodyweight Wide Push-Up | Dumbbell Incline Fly | Cable Standing Fly | Keep a soft bend in your elbows. |
| Dumbbell Incline Fly | mid | dumbbell | lb | 90 | Bodyweight Feet-Elevated Push-Up | Dumbbell Fly | Cable Ascending Fly | Keep the elbow angle steady as your arms open. |
| Cable Ascending Fly | mid | cable | lb | 90 | Bodyweight Feet-Elevated Push-Up | Dumbbell Incline Fly | Selectorized Machine Pec Deck | Sweep the handles upward and inward. |
| Selectorized Machine Pec Deck | mid | selectorized machine | lb | 90 | Bodyweight Wide Push-Up | Dumbbell Fly | Cable Standing Fly | Adjust the seat so your upper arms are near shoulder height. |
| Cable Seated Chest Press | mid | cable | lb | 120 | Bodyweight Push-Up | Dumbbell Bench Press | Selectorized Machine Chest Press | Sit facing away from the pulleys. Start with the handles at chest height and press forward. |
| Bodyweight Dip | lower | bodyweight | bw | 120 | Bodyweight Push-Up | Dumbbell Decline Press | Selectorized Machine Assisted Dip |  |
| Dumbbell Decline Press | lower | dumbbell | lb | 120 | Bodyweight Dip | Dumbbell Bench Press | Selectorized Machine Assisted Dip | Use a decline bench with a secure leg support. |
| Cable Descending Fly | lower | cable | lb | 90 | Bodyweight Dip | Dumbbell Decline Press | Selectorized Machine Pec Deck | Sweep the handles down and inward. |
| Selectorized Machine Assisted Dip | lower | selectorized machine | lb | 120 | Bodyweight Dip | Dumbbell Decline Press | Plate-Loaded Machine Seated Dip | Enter the machine's assistance setting. More assistance makes the rep easier. |

### Back (36)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Bodyweight Pull-Up | lats | bodyweight | bw | 120 | Bodyweight Chin-Up | Dumbbell Pullover | Cable Lat Pulldown |  |
| Cable Lat Pulldown | lats | cable | lb | 120 | Bodyweight Pull-Up | Dumbbell Pullover | Plate-Loaded Machine Lat Pulldown |  |
| Dumbbell One-Arm Row | lats | dumbbell | lb | 120 | Bodyweight Inverted Row | Barbell Bent-Over Row | Selectorized Machine Seated Row |  |
| Bodyweight Chin-Up | lats | bodyweight | bw | 120 | Bodyweight Supinated Inverted Row | Dumbbell Alternating Curl | Selectorized Machine Assisted Pull-Up | Use an underhand grip. |
| Dumbbell Pullover | lats | dumbbell | lb | 90 | Bodyweight Pull-Up | Band Lat Pulldown | Plate-Loaded Machine Pullover | Keep a soft elbow bend and move from the shoulders. |
| Band Lat Pulldown | lats | band | lb | 120 | Bodyweight Pull-Up | Dumbbell Pullover | Cable Lat Pulldown | Use a secure overhead anchor. |
| Cable Wide-Grip Lat Pulldown | lats | cable | lb | 120 | Bodyweight Pull-Up | Band Lat Pulldown | Cable Lat Pulldown | Pull the bar toward your upper chest. |
| Selectorized Machine Assisted Pull-Up | lats | selectorized machine | lb | 120 | Bodyweight Pull-Up | Dumbbell Pullover | Cable Lat Pulldown | Enter the machine's assistance setting. More assistance makes the rep easier. |
| Plate-Loaded Machine Lat Pulldown | lats | plate-loaded machine | lb | 120 | Bodyweight Pull-Up | Dumbbell Pullover | Cable Lat Pulldown |  |
| Plate-Loaded Machine Pullover | lats | plate-loaded machine | lb | 90 | Bodyweight Pull-Up | Dumbbell Pullover | Cable Straight-Arm Pulldown | Adjust the seat so the machine pivot lines up with your shoulders. |
| Cable Straight-Arm Pulldown | lats | cable | lb | 90 | Bodyweight Pull-Up | Dumbbell Pullover | Plate-Loaded Machine Pullover | Keep the elbow angle steady as you sweep the bar toward your thighs. |
| Cable Seated Supinated-Grip Row | lats | cable | lb | 120 | Bodyweight Supinated Inverted Row | Dumbbell One-Arm Row | Selectorized Machine Seated Row | Keep your elbows close and row toward your lower ribs. |
| Cable One-Arm Row | lats | cable | lb | 120 | Bodyweight Inverted Row | Dumbbell One-Arm Row | Plate-Loaded Machine One-Arm Row | Keep your torso square through the pull. |
| Plate-Loaded Machine One-Arm Row | lats | plate-loaded machine | lb | 120 | Bodyweight Inverted Row | Dumbbell One-Arm Row | Cable One-Arm Row | Record the load on the working arm. |
| Selectorized Machine Standing Shoulder Adduction | lats | selectorized machine | lb | 90 | Bodyweight Pull-Up | Band Lat Pulldown | Cable Straight-Arm Pulldown | Start with your arms out to the sides. Keep a soft bend in your elbows and sweep the handles down in an arc toward your hips. |
| Bodyweight Prone Y Raise | upper back | bodyweight | bw | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Cable Face Pull | Reach your arms into a Y and lift them slightly off the floor. |
| Dumbbell Shrug | upper back | dumbbell | lb | 90 | Bodyweight Prone Y Raise | Barbell Shrug | Cable Shrug | Lift your shoulders straight up. |
| Barbell Shrug | upper back | barbell | lb | 90 | Bodyweight Prone Y Raise | Dumbbell Shrug | Cable Shrug | Keep your arms long. |
| Cable Shrug | upper back | cable | lb | 90 | Bodyweight Prone Y Raise | Dumbbell Shrug | Plate-Loaded Machine Shrug | Raise and lower your shoulders under control. |
| Plate-Loaded Machine Shrug | upper back | plate-loaded machine | lb | 90 | Bodyweight Prone Y Raise | Dumbbell Shrug | Cable Shrug | Keep your arms long and raise and lower your shoulders under control. |
| Plate-Loaded Machine Sled Hand-Over-Hand Rope Pull | upper back | plate-loaded machine | lb | 120 | Bodyweight Inverted Row | Dumbbell One-Arm Row | Cable Seated Row | Stay in place and pull the sled toward you hand over hand. Count one fixed-distance pull as one rep. |
| Barbell Bent-Over Row | mid back | barbell | lb | 120 | Bodyweight Inverted Row | Dumbbell One-Arm Row | Cable Seated Row |  |
| Cable Seated Row | mid back | cable | lb | 120 | Bodyweight Inverted Row | Dumbbell Chest-Supported Row | Selectorized Machine Seated Row |  |
| Bodyweight Inverted Row | mid back | bodyweight | bw | 120 | Bodyweight Feet-Elevated Inverted Row | Barbell Bent-Over Row | Cable Seated Row | Use a fixed bar and keep your body straight. |
| Bodyweight Feet-Elevated Inverted Row | mid back | bodyweight | bw | 120 | Bodyweight Inverted Row | Barbell Bent-Over Row | Cable Seated Row | Use a fixed bar and a stable bench. |
| Barbell Seal Row | mid back | barbell | lb | 120 | Bodyweight Inverted Row | Dumbbell Chest-Supported Row | Plate-Loaded Machine Chest-Supported T-Bar Row | Use a stable high bench or a dedicated seal row bench. |
| Dumbbell Chest-Supported Row | mid back | dumbbell | lb | 120 | Bodyweight Inverted Row | Barbell Seal Row | Plate-Loaded Machine Chest-Supported T-Bar Row | Keep your chest on the bench. |
| Selectorized Machine Seated Row | mid back | selectorized machine | lb | 120 | Bodyweight Inverted Row | Barbell Bent-Over Row | Cable Seated Row |  |
| Plate-Loaded Machine Chest-Supported T-Bar Row | mid back | plate-loaded machine | lb | 120 | Bodyweight Inverted Row | Barbell Seal Row | Selectorized Machine Seated Row | Keep your chest against the pad. |
| Barbell Deadlift | lower back | barbell | lb | 120 | Bodyweight Hip Hinge | Kettlebell Deadlift | Smith Machine Romanian Deadlift |  |
| Bodyweight Back Extension | lower back | bodyweight | bw | 120 | Bodyweight Prone Back Extension | Barbell Deadlift | Selectorized Machine Back Extension | Use a back extension bench and move at your hips. |
| Bodyweight Prone Back Extension | lower back | bodyweight | bw | 120 | Bodyweight Back Extension | Barbell Deadlift | Selectorized Machine Back Extension | Lie face down and lift your chest slightly. |
| Kettlebell Deadlift | lower back | kettlebell | lb | 120 | Bodyweight Back Extension | Barbell Deadlift | Selectorized Machine Back Extension | Start with the bell centered between your feet. |
| Barbell Good Morning | lower back | barbell | lb | 120 | Bodyweight Hip Hinge | Dumbbell Romanian Deadlift | Smith Machine Romanian Deadlift | Soften your knees and hinge at the hips. |
| Selectorized Machine Back Extension | lower back | selectorized machine | lb | 120 | Bodyweight Back Extension | Barbell Deadlift | Smith Machine Romanian Deadlift |  |
| Smith Machine Romanian Deadlift | lower back | Smith machine | lb | 120 | Bodyweight Back Extension | Barbell Deadlift | Selectorized Machine Back Extension | Keep the bar close to your legs. |

### Shoulders (25)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Overhead Press | front | barbell | lb | 120 | Bodyweight Pike Push-Up | Dumbbell Shoulder Press | Selectorized Machine Shoulder Press |  |
| Dumbbell Shoulder Press | front | dumbbell | lb | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press |  |
| Bodyweight Pike Push-Up | front | bodyweight | bw | 120 | Bodyweight Feet-Elevated Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press | Lower the top of your head toward the floor between your hands. |
| Bodyweight Feet-Elevated Pike Push-Up | front | bodyweight | bw | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press | Support your feet on a stable bench. |
| Dumbbell Seated Shoulder Press | front | dumbbell | lb | 120 | Bodyweight Pike Push-Up | Dumbbell Shoulder Press | Plate-Loaded Machine Shoulder Press | Keep your torso supported against the bench. |
| Selectorized Machine Shoulder Press | front | selectorized machine | lb | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Plate-Loaded Machine Shoulder Press |  |
| Plate-Loaded Machine Shoulder Press | front | plate-loaded machine | lb | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press | Set seat height so the handles start near shoulder level. |
| Smith Machine Shoulder Press | front | Smith machine | lb | 120 | Bodyweight Pike Push-Up | Barbell Overhead Press | Selectorized Machine Shoulder Press |  |
| Cable Seated Shoulder Press | front | cable | lb | 120 | Bodyweight Pike Push-Up | Dumbbell Seated Shoulder Press | Selectorized Machine Shoulder Press | Sit between two low pulleys. Start with the handles near shoulder height and press overhead. |
| Dumbbell Lateral Raise | side | dumbbell | lb | 90 | Bodyweight Side-Lying Lateral Raise | Band Lateral Raise | Cable Lateral Raise |  |
| Bodyweight Side-Lying Lateral Raise | side | bodyweight | bw | 90 | Bodyweight Prone T Raise | Dumbbell Lateral Raise | Cable Lateral Raise | Use the weight of your straight arm and lift it under control. |
| Band Lateral Raise | side | band | lb | 90 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Cable Lateral Raise | Stand on the band to anchor it. |
| Dumbbell Upright Row | side | dumbbell | lb | 120 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Cable Lateral Raise | Lead with your elbows and use a comfortable range. |
| Cable Lateral Raise | side | cable | lb | 90 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Plate-Loaded Machine Lateral Raise |  |
| Plate-Loaded Machine Lateral Raise | side | plate-loaded machine | lb | 90 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Cable Lateral Raise |  |
| Selectorized Machine Lateral Raise | side | selectorized machine | lb | 90 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Selectorized Machine Standing Lateral Raise | Set the pads or handles to a comfortable starting position. Raise your arms out to the sides. |
| Selectorized Machine Standing Lateral Raise | side | selectorized machine | lb | 90 | Bodyweight Side-Lying Lateral Raise | Dumbbell Lateral Raise | Selectorized Machine Lateral Raise | Stand tall and raise the handles out to the sides. Lower under control. |
| Cable Face Pull | rear | cable | lb | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Selectorized Machine Reverse Pec Deck |  |
| Bodyweight Prone T Raise | rear | bodyweight | bw | 90 | Bodyweight Prone W Raise | Band Pull-Apart | Cable Face Pull | Reach your arms out to the sides and lift slightly. |
| Bodyweight Prone W Raise | rear | bodyweight | bw | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Cable Face Pull | Bend your elbows and lift your arms into a W. |
| Band Pull-Apart | rear | band | lb | 90 | Bodyweight Prone T Raise | Dumbbell Bent-Over Reverse Fly | Cable Face Pull | Keep your ribs still as your hands move apart. |
| Dumbbell Bent-Over Reverse Fly | rear | dumbbell | lb | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Cable Face Pull | Keep a soft bend in the elbows. |
| Dumbbell Lying Reverse Lateral Raise | rear | dumbbell | lb | 90 | Bodyweight Prone T Raise | Dumbbell Bent-Over Reverse Fly | Selectorized Machine Reverse Pec Deck | Lie chest-down and lift your arms out to the sides. |
| Cable Rear Delt Fly | rear | cable | lb | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Cable Face Pull | Sweep your arms out with a steady elbow angle. |
| Selectorized Machine Reverse Pec Deck | rear | selectorized machine | lb | 90 | Bodyweight Prone T Raise | Band Pull-Apart | Cable Face Pull | Keep your chest against the pad. |

### Biceps (20)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Dumbbell Incline Curl | long head | dumbbell | lb | 90 | Bodyweight Chin-Up | Dumbbell Alternating Curl | Cable Bayesian Curl |  |
| Band Curl | long head | band | lb | 90 | Bodyweight Chin-Up | Dumbbell Incline Curl | Cable Bayesian Curl | Anchor the band under your feet. |
| Cable Bayesian Curl | long head | cable | lb | 90 | Bodyweight Chin-Up | Dumbbell Incline Curl | Cable Curl | Face away from the low pulley with your upper arm slightly behind you. |
| Barbell Curl | short head | barbell | lb | 90 | Bodyweight Chin-Up | Barbell EZ-Bar Curl | Cable Curl | Use a straight bar with an underhand grip. |
| Selectorized Machine Preacher Curl | short head | selectorized machine | lb | 90 | Bodyweight Chin-Up | Dumbbell Preacher Curl | Cable Preacher Curl |  |
| Bodyweight Supinated Inverted Row | short head | bodyweight | bw | 120 | Bodyweight Chin-Up | Dumbbell One-Arm Row | Cable Seated Supinated-Grip Row | Use an underhand grip on a fixed bar. |
| Dumbbell Alternating Curl | short head | dumbbell | lb | 90 | Bodyweight Chin-Up | Barbell Curl | Cable Curl | Supinate as you curl and keep your upper arm still. |
| Dumbbell Preacher Curl | short head | dumbbell | lb | 90 | Bodyweight Chin-Up | Barbell Curl | Cable Curl | Keep the back of your upper arm on the pad. |
| Cable Curl | short head | cable | lb | 90 | Bodyweight Chin-Up | Barbell Curl | Selectorized Machine Preacher Curl | Keep your elbows near your sides. |
| Cable Preacher Curl | short head | cable | lb | 90 | Bodyweight Chin-Up | Barbell Curl | Cable Curl | Keep your upper arms supported throughout the rep. |
| Barbell EZ-Bar Curl | short head | barbell | lb | 90 | Bodyweight Chin-Up | Barbell Curl | Cable Curl | Use the angled grips on the EZ bar and keep your upper arms steady. |
| Cable Seated Curl | short head | cable | lb | 90 | Bodyweight Chin-Up | Dumbbell Alternating Curl | Cable Curl | Sit facing a low pulley and curl with your palms up. Keep your upper arms steady. |
| Dumbbell Hammer Curl | brachialis | dumbbell | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Band Hammer Curl | Cable Rope Hammer Curl |  |
| Barbell Reverse Curl | brachialis | barbell | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Dumbbell Reverse Curl | Cable Reverse Curl |  |
| Bodyweight Neutral-Grip Pull-Up | brachialis | bodyweight | bw | 120 | Bodyweight Chin-Up | Dumbbell Hammer Curl | Cable Lat Pulldown | Use parallel handles and avoid swinging. |
| Band Hammer Curl | brachialis | band | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Dumbbell Hammer Curl | Cable Rope Hammer Curl | Keep your palms facing each other. |
| Cable Rope Hammer Curl | brachialis | cable | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Dumbbell Hammer Curl | Cable Reverse Curl | Keep a neutral grip through the rep. |
| Dumbbell Reverse Curl | brachialis | dumbbell | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Barbell Reverse Curl | Cable Reverse Curl | Keep your palms down throughout the curl. |
| Cable Reverse Curl | brachialis | cable | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Barbell Reverse Curl | Cable Rope Hammer Curl | Keep your elbows still and palms facing down. |
| Dumbbell Zottman Curl | brachialis | dumbbell | lb | 90 | Bodyweight Neutral-Grip Pull-Up | Dumbbell Reverse Curl | Cable Reverse Curl | Curl palms up, turn your forearms palms down at the top, and lower under control. Turn palms up again at the bottom. |

### Triceps (20)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Cable Overhead Triceps Extension | long head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Overhead Triceps Extension | Cable V-Bar Overhead Triceps Extension |  |
| Dumbbell Skull Crusher | long head | dumbbell | lb | 90 | Bodyweight Bar Triceps Extension | Barbell Skull Crusher | Cable Overhead Triceps Extension |  |
| Barbell Skull Crusher | long head | barbell | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Skull Crusher | Cable Overhead Triceps Extension | Keep your upper arms steady. |
| Dumbbell Overhead Triceps Extension | long head | dumbbell | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Skull Crusher | Cable Overhead Triceps Extension | Keep your ribs down as your elbows bend. |
| Cable V-Bar Overhead Triceps Extension | long head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Overhead Triceps Extension | Cable Overhead Triceps Extension | Use a secure stance and keep your upper arms steady. |
| Cable Rope Pushdown | lateral head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Selectorized Machine Triceps Extension |  |
| Bodyweight Bar Triceps Extension | lateral head | bodyweight | bw | 90 | Bodyweight Kneeling Triceps Extension | Band Pushdown | Cable Rope Pushdown | Use a secure fixed bar and let your elbows bend. |
| Bodyweight Kneeling Triceps Extension | lateral head | bodyweight | bw | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Cable Rope Pushdown | Keep your elbows in and move through them. |
| Band Pushdown | lateral head | band | lb | 90 | Bodyweight Bar Triceps Extension | Dumbbell Triceps Kickback | Cable Rope Pushdown | Use a secure overhead anchor. |
| Dumbbell Triceps Kickback | lateral head | dumbbell | lb | 90 | Bodyweight Kneeling Triceps Extension | Band Pushdown | Cable Triceps Kickback | Keep your upper arm still as you straighten the elbow. |
| Cable Straight-Bar Pushdown | lateral head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Selectorized Machine Triceps Pushdown | Keep your elbows near your sides. |
| Cable V-Bar Pushdown | lateral head | cable | lb | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Cable Rope Pushdown | Keep your torso still. |
| Cable Triceps Kickback | lateral head | cable | lb | 90 | Bodyweight Kneeling Triceps Extension | Dumbbell Triceps Kickback | Cable Rope Pushdown | Keep your upper arm still. |
| Selectorized Machine Triceps Extension | lateral head | selectorized machine | lb | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Cable Rope Pushdown |  |
| Selectorized Machine Triceps Pushdown | lateral head | selectorized machine | lb | 90 | Bodyweight Bar Triceps Extension | Band Pushdown | Cable Straight-Bar Pushdown | Keep your torso steady and press the handles down through a comfortable range. |
| Barbell Close-Grip Bench Press | medial head | barbell | lb | 120 | Bodyweight Diamond Push-Up | Dumbbell Close-Grip Press | Smith Machine Close-Grip Bench Press |  |
| Bodyweight Diamond Push-Up | medial head | bodyweight | bw | 120 | Bodyweight Push-Up | Barbell Close-Grip Bench Press | Smith Machine Close-Grip Bench Press | Place your hands close together. |
| Dumbbell Close-Grip Press | medial head | dumbbell | lb | 120 | Bodyweight Diamond Push-Up | Barbell Close-Grip Bench Press | Smith Machine Close-Grip Bench Press | Keep your elbows near your torso. |
| Smith Machine Close-Grip Bench Press | medial head | Smith machine | lb | 120 | Bodyweight Diamond Push-Up | Barbell Close-Grip Bench Press | Plate-Loaded Machine Seated Dip |  |
| Plate-Loaded Machine Seated Dip | medial head | plate-loaded machine | lb | 120 | Bodyweight Diamond Push-Up | Dumbbell Close-Grip Press | Smith Machine Close-Grip Bench Press | Set the seat so the handles start in a comfortable position. |

### Forearms (7)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Dumbbell Wrist Curl | flexors | dumbbell | lb | 90 | Bodyweight Self-Resisted Wrist Curl | Barbell Wrist Curl | Cable Wrist Curl |  |
| Bodyweight Self-Resisted Wrist Curl | flexors | bodyweight | bw | 90 | Bodyweight Chin-Up | Dumbbell Wrist Curl | Cable Wrist Curl | Use your opposite hand to resist wrist flexion. |
| Barbell Wrist Curl | flexors | barbell | lb | 90 | Bodyweight Self-Resisted Wrist Curl | Dumbbell Wrist Curl | Cable Wrist Curl | Support your forearms. |
| Cable Wrist Curl | flexors | cable | lb | 90 | Bodyweight Self-Resisted Wrist Curl | Dumbbell Wrist Curl | Cable Wrist Extension | Move at the wrist with your forearm supported. |
| Bodyweight Self-Resisted Wrist Extension | extensors | bodyweight | bw | 90 | Bodyweight Neutral-Grip Pull-Up | Dumbbell Wrist Extension | Cable Wrist Extension | Use your opposite hand to resist wrist extension. |
| Dumbbell Wrist Extension | extensors | dumbbell | lb | 90 | Bodyweight Self-Resisted Wrist Extension | Dumbbell Reverse Curl | Cable Wrist Extension | Support your forearm with your palm down. |
| Cable Wrist Extension | extensors | cable | lb | 90 | Bodyweight Self-Resisted Wrist Extension | Dumbbell Wrist Extension | Cable Reverse Curl | Support your forearm and move at the wrist. |

### Core (17)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Cable Kneeling Crunch | abs | cable | lb | 90 | Bodyweight Crunch | Dumbbell Weighted Crunch | Selectorized Machine Ab Crunch |  |
| Bodyweight Hanging Knee Raise | abs | bodyweight | bw | 90 | Bodyweight Reverse Crunch | Dumbbell Weighted Crunch | Cable Kneeling Crunch |  |
| Bodyweight Crunch | abs | bodyweight | bw | 90 | Bodyweight Reverse Crunch | Dumbbell Weighted Crunch | Cable Kneeling Crunch | Curl your ribs toward your pelvis. |
| Bodyweight Reverse Crunch | abs | bodyweight | bw | 90 | Bodyweight Crunch | Dumbbell Weighted Crunch | Cable Kneeling Crunch | Tilt your pelvis to lift your hips slightly. |
| Dumbbell Weighted Crunch | abs | dumbbell | lb | 90 | Bodyweight Crunch | Dumbbell Side Bend | Cable Kneeling Crunch | Hold the dumbbell close to your chest. |
| Selectorized Machine Ab Crunch | abs | selectorized machine | lb | 90 | Bodyweight Crunch | Dumbbell Weighted Crunch | Cable Kneeling Crunch | Curl your ribs toward your pelvis through a controlled range. |
| Cable Woodchop | obliques | cable | lb | 90 | Bodyweight Russian Twist | Dumbbell Side Bend | Selectorized Machine Rotary Torso |  |
| Bodyweight Side Plank Hip Lift | obliques | bodyweight | bw | 90 | Bodyweight Russian Twist | Dumbbell Side Bend | Cable Woodchop | Lift and lower your hips under control. |
| Bodyweight Russian Twist | obliques | bodyweight | bw | 90 | Bodyweight Side Plank Hip Lift | Dumbbell Side Bend | Cable Woodchop | Rotate your rib cage under control. |
| Dumbbell Side Bend | obliques | dumbbell | lb | 90 | Bodyweight Side Plank Hip Lift | Band Woodchop | Cable Woodchop | Keep your shoulders facing forward. |
| Band Woodchop | obliques | band | lb | 90 | Bodyweight Side Plank Hip Lift | Dumbbell Side Bend | Cable Woodchop | Use a secure anchor and control the return. |
| Selectorized Machine Rotary Torso | obliques | selectorized machine | lb | 90 | Bodyweight Side Plank Hip Lift | Dumbbell Side Bend | Cable Woodchop | Use a controlled range and set the machine for each side. |
| Cable Pallof Press | deep core | cable | lb | 90 | Bodyweight Dead Bug | Band Pallof Press | Cable Half-Kneeling Pallof Press |  |
| Bodyweight Dead Bug | deep core | bodyweight | bw | 90 | Bodyweight Bird Dog | Band Pallof Press | Cable Pallof Press | Keep your lower back steady as opposite limbs move. |
| Bodyweight Bird Dog | deep core | bodyweight | bw | 90 | Bodyweight Dead Bug | Band Pallof Press | Cable Pallof Press | Keep your hips level while reaching. |
| Band Pallof Press | deep core | band | lb | 90 | Bodyweight Dead Bug | Band Woodchop | Cable Pallof Press | Press straight ahead without rotating. |
| Cable Half-Kneeling Pallof Press | deep core | cable | lb | 90 | Bodyweight Bird Dog | Band Pallof Press | Cable Pallof Press | Brace and keep your shoulders square. |

### Glutes (17)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Hip Thrust | max | barbell | lb | 120 | Bodyweight Glute Bridge | Dumbbell Hip Thrust | Plate-Loaded Machine Hip Thrust |  |
| Kettlebell Swing | max | kettlebell | lb | 120 | Bodyweight Hip Hinge | Dumbbell Swing | Cable Pull-Through |  |
| Bodyweight Glute Bridge | max | bodyweight | bw | 120 | Bodyweight Single-Leg Glute Bridge | Barbell Hip Thrust | Plate-Loaded Machine Hip Thrust | Finish at the hips without arching your lower back. |
| Bodyweight Single-Leg Glute Bridge | max | bodyweight | bw | 120 | Bodyweight Glute Bridge | Barbell Hip Thrust | Plate-Loaded Machine Hip Thrust | Keep your pelvis level. |
| Dumbbell Hip Thrust | max | dumbbell | lb | 120 | Bodyweight Glute Bridge | Barbell Hip Thrust | Plate-Loaded Machine Hip Thrust | Use a stable bench and pad the dumbbell if needed. |
| Plate-Loaded Machine Hip Thrust | max | plate-loaded machine | lb | 120 | Bodyweight Glute Bridge | Barbell Hip Thrust | Selectorized Machine Hip Thrust | Position the pad over the crease of your hips. |
| Selectorized Machine Hip Thrust | max | selectorized machine | lb | 120 | Bodyweight Glute Bridge | Barbell Hip Thrust | Plate-Loaded Machine Hip Thrust | Set the pad or belt over your hip crease and record the weight stack setting. |
| Smith Machine Hip Thrust | max | Smith machine | lb | 120 | Bodyweight Glute Bridge | Barbell Hip Thrust | Plate-Loaded Machine Hip Thrust | Position the bench securely and set the stops. |
| Bodyweight Hip Hinge | max | bodyweight | bw | 120 | Bodyweight Back Extension | Kettlebell Swing | Cable Pull-Through | Reach your hips back with soft knees. |
| Dumbbell Swing | max | dumbbell | lb | 120 | Bodyweight Hip Hinge | Kettlebell Swing | Cable Pull-Through | Drive the weight with your hips. |
| Cable Pull-Through | max | cable | lb | 120 | Bodyweight Hip Hinge | Kettlebell Swing | Plate-Loaded Machine Reverse Glute-Ham | Let your hips travel back before driving them forward. |
| Plate-Loaded Machine Reverse Glute-Ham | max | plate-loaded machine | lb | 120 | Bodyweight Back Extension | Dumbbell Romanian Deadlift | Cable Pull-Through | Keep your torso on the pad and swing only through a controlled hip range. |
| Bodyweight Clamshell | medius | bodyweight | bw | 90 | Bodyweight Side-Lying Leg Raise | Band Lateral Walk | Selectorized Machine Hip Abduction | Keep your hips stacked as your top knee opens. |
| Bodyweight Side-Lying Leg Raise | medius | bodyweight | bw | 90 | Bodyweight Clamshell | Band Lateral Walk | Selectorized Machine Hip Abduction | Keep your pelvis stacked and your toes pointing forward. |
| Band Lateral Walk | medius | band | lb | 90 | Bodyweight Clamshell | Band Clamshell | Selectorized Machine Hip Abduction | Maintain tension in the band throughout each step. |
| Band Clamshell | medius | band | lb | 90 | Bodyweight Clamshell | Band Lateral Walk | Selectorized Machine Hip Abduction | Keep your hips stacked. |
| Cable Standing Hip Abduction | medius | cable | lb | 90 | Bodyweight Clamshell | Band Lateral Walk | Selectorized Machine Hip Abduction | Keep your hips square as your leg moves out. |

### Calves (10)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Standing Calf Raise | gastrocnemius | selectorized machine | lb | 90 | Bodyweight Single-Leg Calf Raise | Dumbbell Standing Calf Raise | Smith Machine Standing Calf Raise |  |
| Bodyweight Standing Calf Raise | gastrocnemius | bodyweight | bw | 90 | Bodyweight Single-Leg Calf Raise | Dumbbell Standing Calf Raise | Selectorized Machine Standing Calf Raise | Pause briefly at the top. |
| Bodyweight Single-Leg Calf Raise | gastrocnemius | bodyweight | bw | 90 | Bodyweight Standing Calf Raise | Dumbbell Standing Calf Raise | Selectorized Machine Standing Calf Raise | Use light hand support for balance. |
| Dumbbell Standing Calf Raise | gastrocnemius | dumbbell | lb | 90 | Bodyweight Standing Calf Raise | Dumbbell Seated Calf Raise | Smith Machine Standing Calf Raise | Keep your knees nearly straight. |
| Smith Machine Standing Calf Raise | gastrocnemius | Smith machine | lb | 90 | Bodyweight Standing Calf Raise | Dumbbell Standing Calf Raise | Selectorized Machine Standing Calf Raise | Set the stops and use a secure platform if elevating your feet. |
| Selectorized Machine Seated Calf Raise | soleus | selectorized machine | lb | 90 | Bodyweight Bent-Knee Calf Raise | Dumbbell Seated Calf Raise | Plate-Loaded Machine Seated Calf Raise |  |
| Bodyweight Bent-Knee Calf Raise | soleus | bodyweight | bw | 90 | Bodyweight Single-Leg Bent-Knee Calf Raise | Dumbbell Seated Calf Raise | Selectorized Machine Seated Calf Raise | Hold a steady bend in your knees. |
| Bodyweight Single-Leg Bent-Knee Calf Raise | soleus | bodyweight | bw | 90 | Bodyweight Bent-Knee Calf Raise | Dumbbell Seated Calf Raise | Selectorized Machine Seated Calf Raise | Hold a stable support and keep the knee bent. |
| Dumbbell Seated Calf Raise | soleus | dumbbell | lb | 90 | Bodyweight Bent-Knee Calf Raise | Dumbbell Standing Calf Raise | Plate-Loaded Machine Seated Calf Raise | Pad the load on your thighs and lift your heels. |
| Plate-Loaded Machine Seated Calf Raise | soleus | plate-loaded machine | lb | 90 | Bodyweight Bent-Knee Calf Raise | Dumbbell Seated Calf Raise | Selectorized Machine Seated Calf Raise | Place the pad above your knees and move at the ankles. |

### Quads (32)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Back Squat |  | barbell | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Hack Squat |  |
| Plate-Loaded Machine Angled Leg Press |  | plate-loaded machine | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Horizontal Leg Press | Use the angled sled. Keep your pelvis against the pad and engage the stops after the set. |
| Dumbbell Bulgarian Split Squat |  | dumbbell | lb | 120 | Bodyweight Split Squat | Dumbbell Reverse Lunge | Plate-Loaded Machine Bulgarian Split Squat | Log pounds per dumbbell and reps per side. Keep the same convention for comparisons. |
| Selectorized Machine Leg Extension |  | selectorized machine | lb | 90 | Bodyweight Sissy Squat | Band Leg Extension | Cable Leg Extension |  |
| Bodyweight Squat |  | bodyweight | bw | 120 | Bodyweight Heels-Elevated Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press |  |
| Bodyweight Heels-Elevated Squat |  | bodyweight | bw | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Use a stable wedge under your heels. |
| Barbell Front Squat |  | barbell | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Keep your elbows up and the bar supported on your shoulders. |
| Dumbbell Goblet Squat |  | dumbbell | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Hold one dumbbell against your chest. |
| Kettlebell Goblet Squat |  | kettlebell | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Hold one bell close to your chest. |
| Plate-Loaded Machine Horizontal Leg Press |  | plate-loaded machine | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Angled Leg Press | Keep your pelvis and back against the pad. |
| Plate-Loaded Machine Hack Squat |  | plate-loaded machine | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Keep your back against the pad and set the stops before lifting. |
| Plate-Loaded Machine Pendulum Squat |  | plate-loaded machine | lb | 120 | Bodyweight Heels-Elevated Squat | Barbell Back Squat | Plate-Loaded Machine Hack Squat | Set the safety stop and keep your back against the pad. |
| Plate-Loaded Machine Leverage Squat |  | plate-loaded machine | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Pendulum Squat | Set the stops and keep your feet planted. |
| Plate-Loaded Machine Belt Squat |  | plate-loaded machine | lb | 120 | Bodyweight Squat | Dumbbell Goblet Squat | Plate-Loaded Machine Pendulum Squat | Center the belt at your hips and keep your feet planted. |
| Smith Machine Squat |  | Smith machine | lb | 120 | Bodyweight Squat | Barbell Back Squat | Plate-Loaded Machine Angled Leg Press | Set the safety stops before lifting. |
| Bodyweight Split Squat |  | bodyweight | bw | 120 | Bodyweight Reverse Lunge | Dumbbell Bulgarian Split Squat | Smith Machine Split Squat | Lower straight down between your feet. |
| Bodyweight Reverse Lunge |  | bodyweight | bw | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Smith Machine Split Squat | Step back and drive through your front foot. |
| Bodyweight Step-Up |  | bodyweight | bw | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Smith Machine Split Squat | Use a stable step and lower under control. |
| Dumbbell Forward Lunge |  | dumbbell | lb | 120 | Bodyweight Split Squat | Dumbbell Walking Lunge | Smith Machine Split Squat | Step forward and control the descent. |
| Dumbbell Reverse Lunge |  | dumbbell | lb | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Smith Machine Split Squat | Keep most of the load over the front leg. |
| Dumbbell Walking Lunge |  | dumbbell | lb | 120 | Bodyweight Reverse Lunge | Dumbbell Forward Lunge | Smith Machine Split Squat | Step through smoothly and log reps per side. |
| Dumbbell Step-Up |  | dumbbell | lb | 120 | Bodyweight Step-Up | Dumbbell Reverse Lunge | Smith Machine Split Squat | Drive through the top foot and control the way down. |
| Smith Machine Split Squat |  | Smith machine | lb | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Smith Machine Bulgarian Split Squat | Set the safety stops and log reps per side. |
| Smith Machine Bulgarian Split Squat |  | Smith machine | lb | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Plate-Loaded Machine Bulgarian Split Squat | Use a stable rear support and set the safety stops. |
| Plate-Loaded Machine Bulgarian Split Squat |  | plate-loaded machine | lb | 120 | Bodyweight Split Squat | Dumbbell Bulgarian Split Squat | Smith Machine Bulgarian Split Squat | Set a stable rear-foot support and log reps per side. |
| Bodyweight Reverse Nordic Curl |  | bodyweight | bw | 90 | Bodyweight Sissy Squat | Band Leg Extension | Selectorized Machine Leg Extension | Keep your hips extended as you lean back from your knees. |
| Bodyweight Sissy Squat |  | bodyweight | bw | 90 | Bodyweight Reverse Nordic Curl | Band Leg Extension | Selectorized Machine Leg Extension | Use a stable support and keep the range controlled. |
| Band Leg Extension |  | band | lb | 90 | Bodyweight Reverse Nordic Curl | Dumbbell Goblet Squat | Selectorized Machine Leg Extension | Use a secure anchor and extend only at the knee. |
| Cable Leg Extension |  | cable | lb | 90 | Bodyweight Reverse Nordic Curl | Band Leg Extension | Selectorized Machine Leg Extension | Use an ankle cuff and keep your thigh still. |
| Plate-Loaded Machine Sled Push |  | plate-loaded machine | lb | 120 | Bodyweight Step-Up | Dumbbell Walking Lunge | Plate-Loaded Machine Sled Backward Drag | Log the added plates. Count one fixed-distance trip as one rep and keep the distance and surface consistent. |
| Plate-Loaded Machine Sled Backward Drag |  | plate-loaded machine | lb | 120 | Bodyweight Reverse Lunge | Dumbbell Reverse Lunge | Plate-Loaded Machine Sled Push | Hold the sled handles or tow strap and walk backward. Count one fixed-distance trip as one rep. |
| Bodyweight Box Jump |  | bodyweight | bw | 120 | Bodyweight Step-Up | Kettlebell Swing | Plate-Loaded Machine Hack Squat | Jump onto a stable platform, land softly, and step down. Record reps and keep track of platform height. |

### Hamstrings (13)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Barbell Romanian Deadlift |  | barbell | lb | 120 | Bodyweight Single-Leg Romanian Deadlift | Dumbbell Romanian Deadlift | Smith Machine Romanian Deadlift |  |
| Selectorized Machine Seated Leg Curl |  | selectorized machine | lb | 90 | Bodyweight Nordic Curl | Band Lying Leg Curl | Selectorized Machine Lying Leg Curl |  |
| Bodyweight Single-Leg Romanian Deadlift |  | bodyweight | bw | 120 | Bodyweight Hip Hinge | Barbell Romanian Deadlift | Smith Machine Romanian Deadlift | Keep your hips square as you hinge. |
| Dumbbell Romanian Deadlift |  | dumbbell | lb | 120 | Bodyweight Single-Leg Romanian Deadlift | Barbell Romanian Deadlift | Smith Machine Romanian Deadlift | Keep the dumbbells close to your legs. |
| Dumbbell Single-Leg Romanian Deadlift |  | dumbbell | lb | 120 | Bodyweight Single-Leg Romanian Deadlift | Dumbbell Romanian Deadlift | Cable Romanian Deadlift | Keep your hips square and lower under control. |
| Cable Romanian Deadlift |  | cable | lb | 120 | Bodyweight Single-Leg Romanian Deadlift | Barbell Romanian Deadlift | Smith Machine Romanian Deadlift | Hinge away from the low pulley while keeping tension in the cable. |
| Bodyweight Sliding Leg Curl |  | bodyweight | bw | 90 | Bodyweight Nordic Curl | Band Lying Leg Curl | Selectorized Machine Seated Leg Curl | Use sliders or a towel on a smooth surface. |
| Bodyweight Nordic Curl |  | bodyweight | bw | 90 | Bodyweight Sliding Leg Curl | Band Lying Leg Curl | Selectorized Machine Seated Leg Curl | Use a purpose-built bench or secure ankle anchor. |
| Band Lying Leg Curl |  | band | lb | 90 | Bodyweight Sliding Leg Curl | Dumbbell Romanian Deadlift | Selectorized Machine Lying Leg Curl | Use a secure low anchor around the line of the ankles. |
| Selectorized Machine Lying Leg Curl |  | selectorized machine | lb | 90 | Bodyweight Sliding Leg Curl | Band Lying Leg Curl | Selectorized Machine Seated Leg Curl | Align your knees with the machine pivot. |
| Cable Standing Leg Curl |  | cable | lb | 90 | Bodyweight Sliding Leg Curl | Band Lying Leg Curl | Plate-Loaded Machine Standing Leg Curl | Use an ankle cuff and keep your thigh still. |
| Plate-Loaded Machine Standing Leg Curl |  | plate-loaded machine | lb | 90 | Bodyweight Sliding Leg Curl | Band Lying Leg Curl | Selectorized Machine Standing Leg Curl | Line up your knee with the machine pivot and log reps per side. |
| Selectorized Machine Standing Leg Curl |  | selectorized machine | lb | 90 | Bodyweight Sliding Leg Curl | Band Lying Leg Curl | Plate-Loaded Machine Standing Leg Curl | Record the stack setting and log reps per side. |

### Adductors (6)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Hip Adduction |  | selectorized machine | lb | 90 | Bodyweight Side-Lying Adduction | Band Hip Adduction | Cable Standing Hip Adduction |  |
| Bodyweight Side-Lying Adduction |  | bodyweight | bw | 90 | Bodyweight Short-Lever Copenhagen Hip Lift | Dumbbell Lateral Lunge | Selectorized Machine Hip Adduction | Lift the bottom leg while keeping your hips stacked. |
| Bodyweight Short-Lever Copenhagen Hip Lift |  | bodyweight | bw | 90 | Bodyweight Side-Lying Adduction | Dumbbell Lateral Lunge | Selectorized Machine Hip Adduction | Support your top knee on a stable bench and lift your hips. |
| Dumbbell Lateral Lunge |  | dumbbell | lb | 90 | Bodyweight Side-Lying Adduction | Band Hip Adduction | Selectorized Machine Hip Adduction | Step sideways and sit back over the working leg. |
| Band Hip Adduction |  | band | lb | 90 | Bodyweight Side-Lying Adduction | Dumbbell Lateral Lunge | Cable Standing Hip Adduction | Anchor the band to the side and draw your working leg inward. |
| Cable Standing Hip Adduction |  | cable | lb | 90 | Bodyweight Side-Lying Adduction | Dumbbell Lateral Lunge | Selectorized Machine Hip Adduction | Sweep the cuffed leg inward without turning your hips. |

### Abductors (2)

| Exercise | Focus | Equipment | Unit | Rest s | Bodyweight swap | Basic gym swap | Full gym swap | Note |
|---|---|---|---|---|---|---|---|---|
| Selectorized Machine Hip Abduction |  | selectorized machine | lb | 90 | Bodyweight Side-Lying Leg Raise | Band Lateral Walk | Cable Standing Hip Abduction |  |
| Band Standing Hip Abduction |  | band | lb | 90 | Bodyweight Side-Lying Leg Raise | Band Lateral Walk | Selectorized Machine Hip Abduction | Keep your trunk still as your leg moves out. |

## Vocabulary

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
| Quads | (none) |
| Hamstrings | (none) |
| Adductors | (none) |
| Abductors | (none) |

Equipment: barbell, dumbbell, kettlebell, cable, selectorized machine, plate-loaded machine, Smith machine, bodyweight, band, cardio machine.

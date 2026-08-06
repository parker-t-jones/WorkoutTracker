-- Ranked exercise substitutions (approved list).
-- Requires exercises seed (+ metadata updates) to already be present.
-- Safe to re-run: deletes existing rows then re-inserts by name lookup.
--
-- NEXT PASS (substitution engine wiring): the entire vertical_pull group
-- (Pull-Up, Chin-Up, Lat Pulldown, Assisted Pull-Up) shares
-- high_shoulder_strain. When looking up swaps for a shoulder-flagged
-- vertical pull, if every candidate still carries that tag, fall back to
-- skip/deload that movement pattern for the week — do not serve a no-op swap.

delete from public.substitutions;

insert into public.substitutions (
  primary_exercise_id,
  substitute_exercise_id,
  reason_tag,
  priority_rank
)
select p.id, s.id, v.reason_tag, v.priority_rank
from (
  values
    -- Squat
    ('Back Squat', 'Goblet Squat', 'lower_joint_strain', 1),
    ('Back Squat', 'Leg Press', 'lower_joint_strain', 2),
    ('Back Squat', 'Front Squat', 'similar_pattern', 3),
    ('Front Squat', 'Goblet Squat', 'lower_joint_strain', 1),
    ('Front Squat', 'Leg Press', 'lower_joint_strain', 2),
    ('Front Squat', 'Bodyweight Squat', 'equipment_alt', 3),
    ('Goblet Squat', 'Bodyweight Squat', 'equipment_alt', 1),
    ('Goblet Squat', 'Leg Press', 'similar_pattern', 2),
    ('Goblet Squat', 'Bulgarian Split Squat', 'similar_pattern', 3),
    ('Bulgarian Split Squat', 'Goblet Squat', 'similar_pattern', 1),
    ('Bulgarian Split Squat', 'Leg Press', 'lower_joint_strain', 2),
    ('Bulgarian Split Squat', 'Bodyweight Squat', 'equipment_alt', 3),
    ('Leg Press', 'Goblet Squat', 'equipment_alt', 1),
    ('Leg Press', 'Bodyweight Squat', 'equipment_alt', 2),
    ('Leg Press', 'Bulgarian Split Squat', 'similar_pattern', 3),
    ('Bodyweight Squat', 'Goblet Squat', 'similar_pattern', 1),
    ('Bodyweight Squat', 'Leg Press', 'equipment_alt', 2),

    -- Hinge
    ('Conventional Deadlift', 'Trap Bar Deadlift', 'lower_joint_strain', 1),
    ('Conventional Deadlift', 'Romanian Deadlift', 'similar_pattern', 2),
    ('Conventional Deadlift', 'Hip Thrust', 'lower_joint_strain', 3),
    ('Romanian Deadlift', 'Hip Thrust', 'lower_joint_strain', 1),
    ('Romanian Deadlift', 'Trap Bar Deadlift', 'similar_pattern', 2),
    ('Romanian Deadlift', 'Kettlebell Swing', 'equipment_alt', 3),
    ('Trap Bar Deadlift', 'Romanian Deadlift', 'similar_pattern', 1),
    ('Trap Bar Deadlift', 'Hip Thrust', 'lower_joint_strain', 2),
    ('Trap Bar Deadlift', 'Kettlebell Swing', 'equipment_alt', 3),
    ('Kettlebell Swing', 'Hip Thrust', 'lower_joint_strain', 1),
    ('Kettlebell Swing', 'Romanian Deadlift', 'similar_pattern', 2),
    ('Kettlebell Swing', 'Trap Bar Deadlift', 'similar_pattern', 3),
    ('Hip Thrust', 'Romanian Deadlift', 'similar_pattern', 1),
    ('Hip Thrust', 'Kettlebell Swing', 'similar_pattern', 2),
    ('Good Morning', 'Hip Thrust', 'lower_joint_strain', 1),
    ('Good Morning', 'Romanian Deadlift', 'similar_pattern', 2),
    ('Good Morning', 'Bird Dog', 'lower_joint_strain', 3),

    -- Horizontal push
    ('Barbell Bench Press', 'Dumbbell Bench Press', 'equipment_alt', 1),
    ('Barbell Bench Press', 'Push-Up', 'lower_joint_strain', 2),
    ('Barbell Bench Press', 'Cable Chest Fly', 'similar_pattern', 3),
    ('Incline Dumbbell Press', 'Dumbbell Bench Press', 'similar_pattern', 1),
    ('Incline Dumbbell Press', 'Push-Up', 'lower_joint_strain', 2),
    ('Incline Dumbbell Press', 'Cable Chest Fly', 'similar_pattern', 3),
    ('Dumbbell Bench Press', 'Push-Up', 'equipment_alt', 1),
    ('Dumbbell Bench Press', 'Barbell Bench Press', 'equipment_alt', 2),
    ('Dumbbell Bench Press', 'Cable Chest Fly', 'similar_pattern', 3),
    ('Push-Up', 'Dumbbell Bench Press', 'equipment_alt', 1),
    ('Push-Up', 'Cable Chest Fly', 'similar_pattern', 2),
    ('Cable Chest Fly', 'Dumbbell Bench Press', 'similar_pattern', 1),
    ('Cable Chest Fly', 'Push-Up', 'equipment_alt', 2),

    -- Vertical push
    ('Overhead Press', 'Seated Dumbbell Press', 'lower_joint_strain', 1),
    ('Overhead Press', 'Dumbbell Shoulder Press', 'equipment_alt', 2),
    ('Overhead Press', 'Pike Push-Up', 'equipment_alt', 3),
    ('Dumbbell Shoulder Press', 'Seated Dumbbell Press', 'lower_joint_strain', 1),
    ('Dumbbell Shoulder Press', 'Pike Push-Up', 'equipment_alt', 2),
    ('Dumbbell Shoulder Press', 'Lateral Raise', 'similar_pattern', 3),
    ('Seated Dumbbell Press', 'Dumbbell Shoulder Press', 'similar_pattern', 1),
    ('Seated Dumbbell Press', 'Lateral Raise', 'similar_pattern', 2),
    ('Seated Dumbbell Press', 'Pike Push-Up', 'equipment_alt', 3),
    ('Lateral Raise', 'Seated Dumbbell Press', 'similar_pattern', 1),
    ('Lateral Raise', 'Dumbbell Shoulder Press', 'similar_pattern', 2),
    ('Pike Push-Up', 'Seated Dumbbell Press', 'equipment_alt', 1),
    ('Pike Push-Up', 'Dumbbell Shoulder Press', 'equipment_alt', 2),

    -- Horizontal pull
    ('Barbell Bent-Over Row', 'Chest-Supported Row', 'lower_joint_strain', 1),
    ('Barbell Bent-Over Row', 'Seated Cable Row', 'lower_joint_strain', 2),
    ('Barbell Bent-Over Row', 'Dumbbell Row', 'equipment_alt', 3),
    ('Dumbbell Row', 'Chest-Supported Row', 'lower_joint_strain', 1),
    ('Dumbbell Row', 'Seated Cable Row', 'similar_pattern', 2),
    ('Dumbbell Row', 'Inverted Row', 'equipment_alt', 3),
    ('Seated Cable Row', 'Chest-Supported Row', 'similar_pattern', 1),
    ('Seated Cable Row', 'Dumbbell Row', 'equipment_alt', 2),
    ('Seated Cable Row', 'Inverted Row', 'equipment_alt', 3),
    ('Chest-Supported Row', 'Seated Cable Row', 'similar_pattern', 1),
    ('Chest-Supported Row', 'Dumbbell Row', 'equipment_alt', 2),
    ('Chest-Supported Row', 'Inverted Row', 'equipment_alt', 3),
    ('Inverted Row', 'Seated Cable Row', 'equipment_alt', 1),
    ('Inverted Row', 'Dumbbell Row', 'equipment_alt', 2),
    ('Inverted Row', 'Chest-Supported Row', 'similar_pattern', 3),

    -- Vertical pull (Pull-Up/Chin-Up → Lat Pulldown uses controlled_load)
    ('Pull-Up', 'Lat Pulldown', 'controlled_load', 1),
    ('Pull-Up', 'Assisted Pull-Up', 'similar_pattern', 2),
    ('Pull-Up', 'Chin-Up', 'similar_pattern', 3),
    ('Chin-Up', 'Lat Pulldown', 'controlled_load', 1),
    ('Chin-Up', 'Assisted Pull-Up', 'similar_pattern', 2),
    ('Chin-Up', 'Pull-Up', 'similar_pattern', 3),
    ('Lat Pulldown', 'Assisted Pull-Up', 'similar_pattern', 1),
    ('Lat Pulldown', 'Inverted Row', 'equipment_alt', 2),
    ('Lat Pulldown', 'Seated Cable Row', 'similar_pattern', 3),
    ('Assisted Pull-Up', 'Lat Pulldown', 'similar_pattern', 1),
    ('Assisted Pull-Up', 'Inverted Row', 'equipment_alt', 2),
    ('Assisted Pull-Up', 'Seated Cable Row', 'similar_pattern', 3),

    -- Core
    ('Ab Wheel Rollout', 'Plank', 'lower_joint_strain', 1),
    ('Ab Wheel Rollout', 'Dead Bug', 'lower_joint_strain', 2),
    ('Ab Wheel Rollout', 'Bird Dog', 'lower_joint_strain', 3),
    ('Hanging Knee Raise', 'Dead Bug', 'lower_joint_strain', 1),
    ('Hanging Knee Raise', 'Cable Crunch', 'similar_pattern', 2),
    ('Hanging Knee Raise', 'Plank', 'lower_joint_strain', 3),
    ('Plank', 'Dead Bug', 'similar_pattern', 1),
    ('Plank', 'Bird Dog', 'similar_pattern', 2),
    ('Pallof Press', 'Bird Dog', 'equipment_alt', 1),
    ('Pallof Press', 'Dead Bug', 'similar_pattern', 2)
) as v(primary_name, substitute_name, reason_tag, priority_rank)
join public.exercises p on p.name = v.primary_name
join public.exercises s on s.name = v.substitute_name;

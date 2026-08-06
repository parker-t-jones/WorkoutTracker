-- Seed ~35 common exercises covering major movement patterns.
-- Safe to re-run: uses ON CONFLICT on unique name.

insert into exercises (name, movement_pattern, muscle_group) values
  -- Squats
  ('Back Squat', 'squat', 'quads'),
  ('Front Squat', 'squat', 'quads'),
  ('Goblet Squat', 'squat', 'quads'),
  ('Bulgarian Split Squat', 'squat', 'quads'),
  ('Leg Press', 'squat', 'quads'),
  ('Bodyweight Squat', 'squat', 'quads'),

  -- Hinges
  ('Conventional Deadlift', 'hinge', 'hamstrings'),
  ('Romanian Deadlift', 'hinge', 'hamstrings'),
  ('Trap Bar Deadlift', 'hinge', 'posterior chain'),
  ('Kettlebell Swing', 'hinge', 'posterior chain'),
  ('Hip Thrust', 'hinge', 'glutes'),
  ('Good Morning', 'hinge', 'hamstrings'),

  -- Horizontal push
  ('Barbell Bench Press', 'horizontal_push', 'chest'),
  ('Incline Dumbbell Press', 'horizontal_push', 'chest'),
  ('Dumbbell Bench Press', 'horizontal_push', 'chest'),
  ('Push-Up', 'horizontal_push', 'chest'),
  ('Cable Chest Fly', 'horizontal_push', 'chest'),

  -- Vertical push
  ('Overhead Press', 'vertical_push', 'shoulders'),
  ('Dumbbell Shoulder Press', 'vertical_push', 'shoulders'),
  ('Seated Dumbbell Press', 'vertical_push', 'shoulders'),
  ('Lateral Raise', 'vertical_push', 'shoulders'),
  ('Pike Push-Up', 'vertical_push', 'shoulders'),

  -- Horizontal pull
  ('Barbell Bent-Over Row', 'horizontal_pull', 'back'),
  ('Dumbbell Row', 'horizontal_pull', 'back'),
  ('Seated Cable Row', 'horizontal_pull', 'back'),
  ('Chest-Supported Row', 'horizontal_pull', 'back'),
  ('Inverted Row', 'horizontal_pull', 'back'),

  -- Vertical pull
  ('Pull-Up', 'vertical_pull', 'lats'),
  ('Chin-Up', 'vertical_pull', 'lats'),
  ('Lat Pulldown', 'vertical_pull', 'lats'),
  ('Assisted Pull-Up', 'vertical_pull', 'lats'),

  -- Core
  ('Plank', 'core', 'core'),
  ('Dead Bug', 'core', 'core'),
  ('Hanging Knee Raise', 'core', 'core'),
  ('Cable Crunch', 'core', 'core'),
  ('Ab Wheel Rollout', 'core', 'core'),
  ('Bird Dog', 'core', 'core'),
  ('Pallof Press', 'core', 'core')
on conflict (name) do nothing;

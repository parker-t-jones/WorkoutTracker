-- Seed ~38 common exercises covering major movement patterns.
-- Safe to re-run: uses ON CONFLICT on unique name.
-- After insert, updates equipment_required + contraindication_tags.

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

-- Equipment + contraindication metadata (approved tagging).
update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_knee_strain','high_lower_back_load']
  where name = 'Back Squat';
update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_knee_strain']
  where name = 'Front Squat';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_knee_strain']
  where name = 'Goblet Squat';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_knee_strain']
  where name = 'Bulgarian Split Squat';
update exercises set equipment_required = 'machine',
  contraindication_tags = array['high_knee_strain']
  where name = 'Leg Press';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_knee_strain']
  where name = 'Bodyweight Squat';

update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Conventional Deadlift';
update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Romanian Deadlift';
update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Trap Bar Deadlift';
update exercises set equipment_required = 'kettlebell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Kettlebell Swing';
update exercises set equipment_required = 'barbell',
  contraindication_tags = '{}'::text[]
  where name = 'Hip Thrust';
update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Good Morning';

update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Barbell Bench Press';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Incline Dumbbell Press';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Dumbbell Bench Press';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_shoulder_strain','high_wrist_strain']
  where name = 'Push-Up';
update exercises set equipment_required = 'cable',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Cable Chest Fly';

update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Overhead Press';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Dumbbell Shoulder Press';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Seated Dumbbell Press';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Lateral Raise';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_shoulder_strain','high_wrist_strain']
  where name = 'Pike Push-Up';

update exercises set equipment_required = 'barbell',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Barbell Bent-Over Row';
update exercises set equipment_required = 'dumbbell',
  contraindication_tags = '{}'::text[]
  where name = 'Dumbbell Row';
update exercises set equipment_required = 'cable',
  contraindication_tags = '{}'::text[]
  where name = 'Seated Cable Row';
update exercises set equipment_required = 'machine',
  contraindication_tags = '{}'::text[]
  where name = 'Chest-Supported Row';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = '{}'::text[]
  where name = 'Inverted Row';

update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Pull-Up';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Chin-Up';
update exercises set equipment_required = 'machine',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Lat Pulldown';
update exercises set equipment_required = 'machine',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Assisted Pull-Up';

update exercises set equipment_required = 'bodyweight',
  contraindication_tags = '{}'::text[]
  where name = 'Plank';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = '{}'::text[]
  where name = 'Dead Bug';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_shoulder_strain']
  where name = 'Hanging Knee Raise';
update exercises set equipment_required = 'cable',
  contraindication_tags = '{}'::text[]
  where name = 'Cable Crunch';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = array['high_lower_back_load']
  where name = 'Ab Wheel Rollout';
update exercises set equipment_required = 'bodyweight',
  contraindication_tags = '{}'::text[]
  where name = 'Bird Dog';
update exercises set equipment_required = 'cable',
  contraindication_tags = '{}'::text[]
  where name = 'Pallof Press';

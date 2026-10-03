import { copyFileSync } from 'node:fs';
copyFileSync('src/lib/validation/workouts.schema.json', 'static/workouts.schema.json');
copyFileSync('src/lib/seed/bundle.json', 'static/workouts.example.json');

---
name: feature-dimension
description: >-
  Opens a new major feature direction as a roadmap sub-version, with a skill
  for the procedure and spikes for what is not built. Use when the user names
  a new dimension, direction, version node, or sub-version and wants it on
  the roadmap before building.
---

# Open a feature dimension

A dimension is a release-shaped direction. A bugfix, a copy change, or a tweak to a skill that already exists is not one.

## Procedure

1. Read [ROADMAP.md](../../docs/ROADMAP.md): Now, Next, Later, Open spikes, Status. One idea lives there once. Do not copy it into the README.

2. Number the next app sub-version. Shipped slices are 2.5 and 2.6. The next is 2.7, then 2.8. Leave Now on whatever it already says unless they say this direction replaces it.

3. Add a short section for that number:
   - what is already usable
   - the slice to build
   - spikes for what is not built
   - a link to the procedure skill

   The roadmap states the outcome and the order. The steps an agent runs stay in `.cursor/skills/`.

4. Add a Status row. If a Later bullet is the same idea, point it at the new section and delete the duplicate sentences.

5. A question, or a product that is not built, is a spike. A repeatable procedure is a skill. Do not write a skill that pretends the spike exists.

6. Pick the slice they are already doing. Start that. Leave the spikes.

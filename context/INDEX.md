# Crime Cartography shared context

Version: **0.1.0**

This directory is the canonical shared language for Crime Cartography. It
defines what the project is, what it is trying to produce, how people can
participate, and which parts are settled or still open.

The Academy website is a visual and navigation layer over this context. It may
shorten, illustrate, and organize these ideas, but it must not invent a second
version of them. Technical specifications may live elsewhere in the repository;
their project meaning is anchored here.

## Status convention

- `[consolidated]` — directly aligned with the project owner and safe to use as
  the current project definition.
- `[draft]` — a working definition open to public challenge. It is not an
  operative promise, contract, or policy.
- `[future]` — an intended capability that is not operating yet.
- `[historical]` — evidence from the inherited EarthOne production run; it does
  not define the current channel.

When implementation, website copy, or a Discussion conflicts with a
`[consolidated]` definition here, that other surface must be corrected.

## The project in three clusters

| Cluster | Canonical file | What it answers |
|---|---|---|
| Project | [PROJECT.md](PROJECT.md) | What are we building, what is true now, and what happens next? |
| Editorial | [EDITORIAL.md](EDITORIAL.md) | What makes a Crime Cartography video engaging, useful, and safe to release? |
| Participation | [PARTICIPATION.md](PARTICIPATION.md) | How can people help, what is not active yet, and which rules remain open? |

The [GLOSSARY.md](GLOSSARY.md) is the index of named terms. Each term has one
canonical home in one of the three clusters.

## Public decision rooms

Every public Discussion has a versioned source in
[`context/discussions/`](discussions/README.md). Each source contains:

1. what is already known;
2. what remains draft or blocked; and
3. no more than three focused questions.

GitHub comments are public review inputs. They do not directly change project
state, approve a release, authorize spending, or create an economic agreement.
Accepted changes are recorded in the repository before website copy changes.

## Single-home rule

A project fact or definition has one canonical home. Other files link to that
home instead of silently restating it. The website keeps only the minimum copy
needed to tell the story and route a visitor to the right source or decision
room.

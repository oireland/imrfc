# Venues are free text; Stores are the only places kept as records

Events and Series hold their Venue as plain text instead of a link to a Location record, and the old Location concept is now just Store (where kit lives). Keeping a Location for every away ground meant Committee had to add a record before they could add a fixture, for places the club visits once a season. Nothing in the app needs a Venue as a record: kit rules only care about Stores, and a Google Maps search on the text is as good as a saved maps link.

## Consequences

- The same ground can be spelt differently on different Events. Venue boxes suggest venues already used to keep spellings consistent, but nothing enforces it, so nothing should group or match Events by Venue.
- Migration 0011 copied each Event's and Series' Venue name into the text column, archived Locations that were only Venues, and renamed the `location` table to `store`, keeping its rows and foreign keys.

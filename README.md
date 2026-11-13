# Born Elsewhere, Living Here — Honduras, 2013 Census

An interactive flow map of the foreign-born population of Honduras: where residents counted in the 2013 census were born, and the department where they were living.

**Live map:** <https://yani-rivera.github.io/HNDMigration2013/hndmigraton.html>

Author: Yanira A. Rivera · ORCID [0000-0003-3309-5256](https://orcid.org/0000-0003-3309-5256)
Made for the #30DayMapChallenge 2026, Day 13 (Interactions).

## Summary

Each line joins a country of birth to a Honduran department. Its value is the number of people born in that country who were living in that department at the time of the XVII Censo de Población y VI de Vivienda 2013.

| | |
|---|---|
| Flows shown | 199 |
| Countries of birth | 40 |
| Departments | 18 (all) |
| People represented | 31,344 |
| Smallest flow shown | 10 people |

The largest countries of birth in the mapped flows are the United States (7,483), El Salvador (6,833), Nicaragua (6,210), Guatemala (4,450) and Mexico (1,437). Francisco Morazán (7,821) and Cortés (6,308) are the departments with the most foreign-born residents. The single largest flow is Nicaragua → Francisco Morazán (1,762 people).

These figures describe the flows drawn on the map, not the whole foreign-born population (see *Limitations*).

## Data source

- **Census:** Instituto Nacional de Estadística (INE), Honduras. XVII Censo de Población y VI de Vivienda 2013.
- **Access:** INE's Redatam online processing system. Variable: country of birth (*país de nacimiento*), tabulated by department of enumeration.
- **Country reference points:** Natural Earth label points.
- **Department reference points:** one point per department, from the author's department layer.

## Method

1. The Redatam frequency output (country of birth by department) was parsed into a tidy table: one row per country of birth and department, with the number of persons.
2. Country names were matched to English names and ISO 3166-1 alpha-3 codes. Departments carry codes `HN01`–`HN18`, following the official department numbering.
3. Each row received the coordinates of its country point and its department point.
4. Flows of fewer than 10 people were removed. This keeps the map readable and avoids drawing very small counts for small areas.
5. The resulting table was loaded into Kepler.gl, styled by the author, and exported as a single HTML page.

The parsing and preparation scripts (`census_birth`, v0.4.2) record a provenance file for every run: script version, input and output SHA-256 hashes, and summary counts. They are not part of this repository.

## Data dictionary

The flow table is embedded in the page (dataset `kepler_flows.csv`).

| Field | Type | Description |
|---|---|---|
| `origin` | text | Country of birth, ISO 3166-1 alpha-3 code |
| `origin_name` | text | Country of birth, English name |
| `origin_lat`, `origin_lon` | number | Country reference point, WGS 84 |
| `dest` | text | Department of residence, `HN01`–`HN18` |
| `dest_name` | text | Department name |
| `dest_lat`, `dest_lon` | number | Department reference point, WGS 84 |
| `count` | integer | People born in `origin` and living in `dest` in 2013 |

## Limitations

- **The data are from 2013.** They describe the population at the census date and are the most recent census figures available to the author for country of birth by department.
- **The lines are not journeys.** The census records where a person was born and where they lived on census day. It does not record when, how or by what route they arrived, or any place lived in between.
- **Small flows are not shown.** Country–department pairs with fewer than 10 people are excluded, so countries present only in small numbers do not appear, and the totals above are lower than the full foreign-born population.
- **Unspecified country of birth is not shown.** People recorded without a specific country of birth cannot be drawn as a flow.
- **Points are reference points.** A line ends at one point per department and starts at one point per country. It does not indicate a city, a border crossing or a place of residence within the department.
- **Country names follow the source categories** as matched to ISO codes. Categories are shown as recorded in the census output.

## Repository contents

| File | Description |
|---|---|
| `hndmigraton.html` | The interactive map: Kepler.gl page with the flow table and map configuration embedded |
| `README.md` | This document |

## Reuse

- **View:** open the live map, or download `hndmigraton.html` and open it in a browser. An internet connection is needed for the map library and the basemap.
- **Explore the data:** in the map's side panel, the data table can be viewed and exported as CSV.
- **Rebuild:** load the exported CSV at <https://kepler.gl/demo> and add an arc or line layer from the origin and destination coordinates.

## Software

- [Kepler.gl](https://kepler.gl) 3.3.0-alpha.19, loaded from unpkg, with its *Dark Matter* basemap.
- Data preparation: Python (pandas).
- Reference points prepared in QGIS.

## Authorship and use of AI

The map was designed and built by the author in Kepler.gl. The data preparation scripts were written with AI assistance (Claude, Anthropic) and reviewed and run by the author. The census data, the choice of method and all editorial decisions are the author's.

## How to cite

> Rivera, Y. A. (2026). *Born Elsewhere, Living Here: Honduras, 2013 Census* [Interactive map]. GitHub. https://github.com/yani-rivera/HNDMigration2013

Please also cite the source of the data:

> Instituto Nacional de Estadística (INE), Honduras. *XVII Censo de Población y VI de Vivienda 2013.* Processed with Redatam.

## License

*To be completed by the author.* Until a licence is added, the default applies: all rights reserved for the page and its design. The census figures remain subject to INE's terms of use, and Natural Earth data are in the public domain.

## Contact

Questions and corrections: please open an issue in this repository.

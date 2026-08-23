## ADDED Requirements

### Requirement: User News Feed Must Return Nearby Verified Incidents

The system SHALL provide a user-facing news feed endpoint that returns only verified incidents within a provided geographic radius around the user's location.

#### Scenario: Query verified incidents within 5 km

- GIVEN a request to GET /api/v1/user/news with valid lat and long query parameters
- AND radius is omitted
- WHEN the endpoint processes the request
- THEN the system SHALL use a default radius of 5 km
- AND return only incidents whose status is VERIFIED
- AND sort items by newest incident time first

#### Scenario: Query with explicit radius

- GIVEN a request to GET /api/v1/user/news with valid lat, long, and radius
- WHEN radius is within allowed bounds
- THEN the system SHALL filter incidents within that radius
- AND return road-relevant card data including incident type, road name, timestamp, and optional image URL

### Requirement: News Feed Must Support Refreshability for Newly Verified Incidents

The system SHALL allow users to discover newly verified incidents without requiring a full application restart.

#### Scenario: Manual refresh updates feed

- GIVEN a user is viewing the News Feed
- WHEN the user triggers pull-to-refresh
- THEN the system SHALL fetch the latest nearby verified incidents
- AND include incidents newly verified since the previous fetch

#### Scenario: Optional polling while tab is active

- GIVEN polling is enabled by configuration
- WHEN the News Feed tab remains active
- THEN the client SHALL re-request feed data at a configured interval
- AND update the visible feed with any newly verified incidents

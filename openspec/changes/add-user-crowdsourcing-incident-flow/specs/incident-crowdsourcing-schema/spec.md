## ADDED Requirements

### Requirement: Incident Schema Must Track Source and Moderation Status

The system SHALL persist incident provenance and moderation lifecycle as first-class fields.

#### Scenario: Migration adds required fields without dropping legacy records

- GIVEN an existing incident table with historical records
- WHEN the schema migration is applied
- THEN the table SHALL include source, status, reporter_id, image_url, and upvotes fields
- AND legacy records SHALL remain present after migration

#### Scenario: Legacy rows receive safe defaults

- GIVEN historical rows created before crowdsourcing support
- WHEN backfill rules are executed
- THEN each row SHALL receive valid source and status values according to migration policy

### Requirement: News Query Must Exclude Non-Verified Reports

The system SHALL ensure user-facing incident discovery excludes reports that are not verified.

#### Scenario: Pending report is hidden from user feed

- GIVEN a report with status PENDING
- WHEN a user queries nearby incidents through the user news endpoint
- THEN the report SHALL NOT be returned

#### Scenario: Verified report becomes eligible for feed

- GIVEN a report transitions from PENDING to VERIFIED
- WHEN a user queries nearby incidents through the user news endpoint
- THEN the report SHALL be eligible for inclusion if it matches distance criteria

### Requirement: Authorization Policy Must Enforce Ownership and Moderation Roles

The system SHALL enforce ownership for user-created reports and admin-only moderation transitions.

#### Scenario: User cannot modify another user's report

- GIVEN an authenticated user attempts to modify a report with a different reporter_id
- WHEN authorization is evaluated
- THEN the action SHALL be denied

#### Scenario: Admin can perform moderation transition

- GIVEN an authenticated admin requests a valid status transition for a user report
- WHEN the transition rule is allowed
- THEN the system SHALL apply the new status and persist audit metadata according to policy

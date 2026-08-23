## ADDED Requirements

### Requirement: Only Authenticated Users Can Submit Incident Reports

The system SHALL require authenticated user identity for incident report submission.

#### Scenario: Reject unauthenticated submission

- GIVEN a request to POST /api/v1/user/report without valid authentication
- WHEN the API validates the request
- THEN the system SHALL reject the request with an authorization error

#### Scenario: Accept authenticated submission

- GIVEN a request to POST /api/v1/user/report with valid authentication
- AND valid incident payload fields
- WHEN the request is processed
- THEN the system SHALL create a new incident report linked to the authenticated user identity

### Requirement: Report Submission Must Support Optional Evidence Image

The system SHALL accept multipart report payloads with optional image evidence.

#### Scenario: Submit report with image

- GIVEN an authenticated user submits multipart/form-data including an image file
- WHEN the image passes file validation rules
- THEN the system SHALL upload the file to configured object storage
- AND persist the resulting image URL with the report

#### Scenario: Submit report without image

- GIVEN an authenticated user submits a valid report without an image file
- WHEN the request is processed
- THEN the system SHALL persist the report successfully without image URL

### Requirement: New User Reports Must Enter Moderation Queue

The system SHALL create user-submitted reports in pending moderation state.

#### Scenario: Report receives pending status

- GIVEN an authenticated and valid report submission
- WHEN the report is persisted
- THEN the system SHALL set source to USER_REPORT
- AND set status to PENDING
- AND return an acknowledgement message that the report is waiting for review

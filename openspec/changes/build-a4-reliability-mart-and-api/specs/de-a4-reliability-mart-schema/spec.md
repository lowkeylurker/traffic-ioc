## ADDED Requirements

### Requirement: Report reliability data mart MUST duoc tao bang Prisma migration

He thong MUST tao bang `report_reliability` thong qua Prisma schema va migration, khong tao schema thu cong ngoai migration.

#### Scenario: Tao bang report_reliability thanh cong

- **GIVEN** migration Prisma duoc apply tren database muc tieu
- **WHEN** migration hoan tat
- **THEN** bang `report_reliability` ton tai trong PostgreSQL
- **AND** bang la table vat ly (khong phai view)

### Requirement: Bang report_reliability MUST co khoa dinh danh va index phu hop

He thong MUST dinh nghia unique record key theo `(segment_key, time_window, period_start, period_end)` va co index phuc vu filter/sort API.

#### Scenario: Dam bao idempotent upsert

- **GIVEN** worker chay lai cung ky du lieu
- **WHEN** ghi ket qua vao `report_reliability`
- **THEN** he thong upsert theo unique key
- **AND** khong tao duplicate rows

#### Scenario: Toi uu truy van API

- **GIVEN** API truy van theo `timeWindow`, `sortBy`, `limit`
- **WHEN** backend query mart
- **THEN** query su dung index phu hop cho filter va sorting

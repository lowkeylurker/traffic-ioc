## ADDED Requirements

### Requirement: Batch reliability MUST duoc orchestration bang BullMQ + Redis

He thong MUST su dung BullMQ + Redis de scheduler va worker hoa qua trinh tinh toan reliability mart.

#### Scenario: Enqueue job dinh ky

- **GIVEN** lich weekly hoac monthly duoc cau hinh
- **WHEN** den ky chay
- **THEN** scheduler enqueue job vao queue `reliability-mart-batch`
- **AND** payload chua `periodStart`, `periodEnd`, `sourcePeriod`

### Requirement: Job orchestration MUST dam bao idempotency va resilience

He thong MUST ho tro idempotent rerun va retry co kiem soat khi gap loi transient.

#### Scenario: Rerun cung ky du lieu

- **GIVEN** cung mot ky du lieu duoc enqueue lai
- **WHEN** worker xu ly job
- **THEN** he thong khong tao duplicate ket qua mart
- **AND** trang thai job phan biet ro rerun thanh cong

#### Scenario: Loi transient DB/Redis

- **GIVEN** worker gap loi transient trong luc xu ly
- **WHEN** co cau hinh retry/backoff
- **THEN** BullMQ retry theo chinh sach
- **AND** ghi log day du de theo doi failure path

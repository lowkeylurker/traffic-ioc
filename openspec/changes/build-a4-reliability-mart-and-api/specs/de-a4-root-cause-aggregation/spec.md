## ADDED Requirements

### Requirement: Reliability mart MUST co root-cause counts tren moi dong

He thong MUST aggregate incident root causes va luu vao cac cot `cause_accident_count`, `cause_flood_count`, `cause_construction_count` cho moi record reliability.

#### Scenario: Join theo segment key thanh cong

- **GIVEN** incident data co `segment_key` hop le
- **WHEN** batch root-cause aggregation chay
- **THEN** count nguyen nhan duoc tinh theo segment + time window + period
- **AND** ghi vao cac cot cause count tuong ung

### Requirement: He thong MUST co fallback spatial join co dieu kien

He thong MUST cho phep fallback spatial join khi incident thieu `segment_key`, nhung phai gioi han chi phi xu ly.

#### Scenario: Bat fallback khi thieu mapping segment

- **GIVEN** co incident geometry hop le nhung thieu `segment_key`
- **WHEN** fallback spatial join duoc kich hoat
- **THEN** incident duoc map vao segment phu hop theo quy tac khong gian
- **AND** ket qua count duoc cap nhat vao mart

#### Scenario: Khong fallback khi du lieu khong du dieu kien

- **GIVEN** incident khong co `segment_key` va geometry khong hop le
- **WHEN** batch root-cause aggregation chay
- **THEN** he thong bo qua ban ghi do theo quality policy
- **AND** khong lam that bai toan bo batch run

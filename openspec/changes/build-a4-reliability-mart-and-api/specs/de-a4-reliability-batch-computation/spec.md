## ADDED Requirements

### Requirement: Batch SQL MUST tinh T_avg va T_95 theo segment va time window

He thong MUST tinh `t_avg` va `t_95` tren ky du lieu batch bang SQL-first, trong do `t_95` dung `percentile_cont(0.95) WITHIN GROUP`.

#### Scenario: Tinh thong ke reliability co du lieu hop le

- **GIVEN** ky du lieu co ban ghi traffic flow hop le
- **WHEN** batch job chay computation
- **THEN** moi segment + time window co `t_avg` va `t_95`
- **AND** `t_95` duoc tinh bang percentile_cont 0.95

### Requirement: Batch MUST tinh T_freeflow va metric phai sinh BI/PTI

He thong MUST tinh `t_freeflow` tu khung 00:00-04:00 va tinh metric phai sinh theo cong thuc da chot.

#### Scenario: Tinh BI/PTI theo cong thuc

- **GIVEN** `t_avg`, `t_95`, `t_freeflow` hop le
- **WHEN** batch tinh metric phai sinh
- **THEN** `buffer_index = (t_95 - t_avg) / t_avg`
- **AND** `pti = t_95 / t_freeflow`

#### Scenario: Guard rails chia 0 hoac null

- **GIVEN** `t_avg` hoac `t_freeflow` bang 0 hoac null
- **WHEN** batch tinh BI/PTI
- **THEN** he thong khong gay loi runtime
- **AND** gia tri BI/PTI duoc dat null theo quy tac chat luong du lieu

## ADDED Requirements

### Requirement: Dashboard A4 phai uu tien thong ke do tin cay theo corridor

He thong MUST trien khai A4 theo don vi corridor va su dung "corridor" nhat quan trong data model, UI labels, va API contract draft.

#### Scenario: Hien thi ranking theo corridor

- **GIVEN** du lieu reliability hop le
- **WHEN** dashboard A4 duoc render
- **THEN** bang xep hang hien thi danh sach corridor
- **AND** khong su dung don vi road trong hanh vi A4

### Requirement: Reliability table phai ho tro loc theo khung gio va action phan tich

Frontend MUST cung cap bang xep hang voi bo loc `timeWindow` va cot Action de mo phan tich nguyen nhan.

#### Scenario: Doi bo loc khung gio

- **GIVEN** user dang o dashboard A4
- **WHEN** user chon `AM_PEAK`, `PM_PEAK`, hoac `OFF_PEAK`
- **THEN** table duoc cap nhat theo khung gio da chon
- **AND** cac state loading/empty/error duoc hien thi ro rang

#### Scenario: Mo phan tich tu dong du lieu dong duoc chon

- **GIVEN** user click nut/icon "Phan tich" tren mot dong corridor
- **WHEN** modal hoac drawer mo
- **THEN** noi dung phan tich su dung dung du lieu rootCauses cua corridor do

### Requirement: Static heatmap phai to mau corridor bang LineLayer theo nguong Buffer Index

Frontend MUST render heatmap bang `LineLayer` va map mau theo quy tac A4.

#### Scenario: To mau xanh khi corridor on dinh

- **GIVEN** corridor co `bufferIndex < 0.2`
- **WHEN** heatmap render
- **THEN** corridor duoc to mau xanh

#### Scenario: To mau vang cam khi corridor that thuong

- **GIVEN** corridor co `0.2 <= bufferIndex <= 0.4`
- **WHEN** heatmap render
- **THEN** corridor duoc to mau vang hoac cam

#### Scenario: To mau do sam khi corridor bao dong

- **GIVEN** corridor co `bufferIndex > 0.4`
- **WHEN** heatmap render
- **THEN** corridor duoc to mau do sam

### Requirement: Modal phan tich nguyen nhan goc re phai hien thi Pie Chart va dien giai BI

Frontend MUST hien thi pie chart root causes va insight BI cho corridor duoc chon.

#### Scenario: Hien thi ty le root causes

- **GIVEN** row corridor co object `rootCauses`
- **WHEN** user mo modal phan tich
- **THEN** pie chart hien thi cac ty le theo tung nguyen nhan

#### Scenario: Hien thi dien giai BI

- **GIVEN** corridor co gia tri `bufferIndex`
- **WHEN** modal phan tich render
- **THEN** he thong hien thi cau:
  "Nguoi dan di qua day phai du phong them [BI * 100]% thoi gian so voi binh thuong."

### Requirement: API reliability duoc dinh nghia la planned dependency cho phase backend

He thong MUST giu contract planned cho endpoint `GET /api/v1/analytics/reliability` va tri hoan implementation backend sang phase sau.

#### Scenario: Hop dong query params

- **GIVEN** team BE bat dau DAT-67
- **WHEN** implement endpoint reliability
- **THEN** endpoint ho tro query params `timeWindow`, `sortBy`, `limit`
- **AND** `timeWindow` chap nhan `AM_PEAK | PM_PEAK | OFF_PEAK`
- **AND** `sortBy` chap nhan `buffer_index | pti`

#### Scenario: Muc tieu hieu nang API

- **GIVEN** endpoint reliability da san sang o phase backend
- **WHEN** benchmark tren data mart report_reliability
- **THEN** p95 response time dat muc tieu nho hon 100ms

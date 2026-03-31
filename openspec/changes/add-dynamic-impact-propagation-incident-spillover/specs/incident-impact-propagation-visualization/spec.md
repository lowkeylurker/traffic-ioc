## ADDED Requirements

### Requirement: Frontend MUST ho tro tuong tac click incident de hien thi vet loang ket xe

Frontend map MUST goi impact propagation API khi operator click vao marker su co.

#### Scenario: Click marker va fetch propagation

- GIVEN operator dang xem ban do realtime
- AND co marker su co tren map
- WHEN operator click vao marker
- THEN frontend SHALL goi endpoint impact propagation voi `incidentId` tuong ung
- AND hien thi loading state trong luc cho du lieu

### Requirement: Frontend MUST render PathLayer vet loang voi visual encoding theo severity

Frontend MUST ve impacted segments bang Deck.gl PathLayer de the hien muc do anh huong lan truyen.

#### Scenario: Render overlay thanh cong

- GIVEN API tra ve `impactedSegments` hop le
- WHEN frontend nhan response
- THEN frontend SHALL render PathLayer mau do tren cac segment bi anh huong
- AND do day/opacity SHALL phan cap theo `severityLevel`

#### Scenario: Pulse/Glow effect

- GIVEN overlay impact dang hien thi
- WHEN animation cycle chay
- THEN frontend SHALL ap dung glow/pulse de tao hieu ung "vet dau loang" truc quan

### Requirement: Frontend MUST co legend va state handling ro rang cho impact layer

Frontend MUST bo sung UX components de operator hieu nhanh muc do anh huong va trang thai he thong.

#### Scenario: Hien thi legend severity va summary

- GIVEN impact layer da render
- WHEN user quan sat ban do
- THEN frontend SHALL hien legend severity cho overlay
- AND hien summary impact gom tong segment, chieu dai anh huong, muc do nghiem trong

#### Scenario: Empty state

- GIVEN API tra ve thanh cong nhung `impactedSegments` rong
- WHEN frontend xu ly response
- THEN frontend SHALL hien thi thong diep "chua ghi nhan vet loang dang ke" va khong render PathLayer

#### Scenario: Error state

- GIVEN API call that bai
- WHEN frontend xu ly loi
- THEN frontend SHALL hien thong bao loi than thien
- AND khong lam vo cac layer traffic/incident hien co

### Requirement: Frontend MUST dong bo impact overlay voi lop traffic hien co

Frontend MUST dam bao impact overlay khong che mat thong tin traffic cot loi.

#### Scenario: Layer ordering va opacity

- GIVEN map dang render dong thoi traffic layer va impact layer
- WHEN impact layer bat
- THEN frontend SHALL dat thu tu layer va opacity de van quan sat duoc traffic speed layer ben duoi
- AND user co the tiep tuc thao tac map binh thuong

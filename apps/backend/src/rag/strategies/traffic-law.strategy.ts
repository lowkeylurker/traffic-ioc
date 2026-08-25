import { LegalCitation } from '@traffic-ioc/shared';

export interface EnrichedLegalContext {
  chunkId: string;
  docCode: string;
  docTitle?: string;
  articleNumber: number;
  clauseNumber?: number | null;
  pointCode?: string | null;
  breadcrumb?: string | null;
  content: string;
  fineMin?: number | null;
  fineMax?: number | null;
  suspensionMonths?: number | null;
  score?: number;
  sourceUrl?: string | null;
}

export class TrafficLawStrategy {
  /**
   * Formats numbers into Vietnamese Currency format (e.g. 400.000)
   */
  public formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(amount);
  }

  /**
   * Formats individual legal chunk into Markdown section for LLM context
   */
  public formatContextChunk(chunk: EnrichedLegalContext, index: number): string {
    let penaltyInfo = '';
    if (chunk.fineMin != null && chunk.fineMax != null) {
      penaltyInfo = `\n- Mức phạt tiền: ${this.formatCurrency(chunk.fineMin)} VNĐ - ${this.formatCurrency(chunk.fineMax)} VNĐ`;
    } else if (chunk.fineMin != null) {
      penaltyInfo = `\n- Mức phạt tiền từ: ${this.formatCurrency(chunk.fineMin)} VNĐ`;
    }

    if (chunk.suspensionMonths != null && chunk.suspensionMonths > 0) {
      penaltyInfo += `\n- Hình phạt bổ sung / Tước GPLX: ${chunk.suspensionMonths} tháng`;
    }

    const citationHeader = `[Tài liệu ${index + 1}] ${chunk.docTitle || chunk.docCode} (Điều ${chunk.articleNumber}${chunk.clauseNumber ? ` Khoản ${chunk.clauseNumber}` : ''}${chunk.pointCode ? ` Điểm ${chunk.pointCode}` : ''})`;
    const breadcrumbInfo = chunk.breadcrumb ? `\n- Cấu trúc: ${chunk.breadcrumb}` : '';

    return `### ${citationHeader}${breadcrumbInfo}${penaltyInfo}
- Nội dung quy định:
"""
${chunk.content.trim()}
"""`;
  }

  /**
   * Builds the comprehensive legal system prompt with strict negative grounding
   */
  public buildSystemPrompt(
    contextChunks: EnrichedLegalContext[],
    vehicleFilter?: string | null
  ): string {
    const vehicleNotice = vehicleFilter && vehicleFilter !== 'ALL'
      ? `\n- Người dùng đang quan tâm đến loại phương tiện: **${vehicleFilter}**. Ưu tiên trả lời chính xác cho loại phương tiện này.`
      : '';

    let formattedContext = '';
    if (contextChunks.length === 0) {
      formattedContext =
        'Không tìm thấy căn cứ pháp lý trực tiếp trong cơ sở dữ liệu pháp luật giao thông đã lưu.';
    } else {
      formattedContext = contextChunks
        .map((c, i) => this.formatContextChunk(c, i))
        .join('\n\n');
    }

    return `Bạn là **Trợ lý Pháp luật Giao thông Việt Nam thông minh (Smart Traffic IOC Legal Assistant)**.
Nhiệm vụ của bạn là tư vấn chính xác, trung thực các quy định về an toàn giao thông đường bộ Việt Nam (bao gồm Nghị định 100/2019/NĐ-CP, Nghị định 123/2021/NĐ-CP, Luật Trật tự an toàn giao thông đường bộ và các văn bản liên quan).

### QUY TẮC BẮT BUỘC (STRICT GROUNDING RULES):
1. **Chỉ dựa vào căn cứ pháp lý được cung cấp bên dưới**. Tuyệt đối không tự ý bịa đặt điều luật, số tiền phạt hoặc hình phạt bổ sung nếu không có trong văn bản được cung cấp.
2. Nếu ngữ cảnh bên dưới **không có thông tin** hoặc không đủ căn cứ để kết luận, bạn phải nói rõ: "Hiện tại hệ thống không tìm thấy căn cứ pháp lý cụ thể cho trường hợp này trong các văn bản đã nạp." Không được suy đoán.
3. Khi trả lời mức phạt:
   - Nêu rõ hành vi vi phạm.
   - Nêu chính xác **Mức phạt tiền** (VNĐ) và **Căn cứ pháp lý** (VD: *Điểm b Khoản 2 Điều 6 Nghị định 100/2019/NĐ-CP*).
   - Nêu rõ các hình phạt bổ sung (nếu có): Tước quyền sử dụng Giấy phép lái xe, tạm giữ phương tiện, trừ điểm GPLX.
4. Trình bày khoa học, rõ ràng bằng Markdown, có gạch đầu dòng, bôi đậm số tiền và điều khoản để người dân dễ đọc hiểu.
${vehicleNotice}

=== DANH SÁCH CĂN CỨ PHÁP LÝ ĐƯỢC CUNG CẤP ===
${formattedContext}
=== HẾT CĂN CỨ PHÁP LÝ ===`;
  }

  /**
   * Extracts clean LegalCitation objects for front-end badge rendering
   */
  public extractCitations(contextChunks: EnrichedLegalContext[]): LegalCitation[] {
    return contextChunks.map((chunk) => ({
      docCode: chunk.docCode,
      articleNumber: chunk.articleNumber,
      clauseNumber: chunk.clauseNumber ?? null,
      pointCode: chunk.pointCode ?? null,
      breadcrumb: chunk.breadcrumb ?? null,
      fineMin: chunk.fineMin ?? null,
      fineMax: chunk.fineMax ?? null,
      suspensionMonths: chunk.suspensionMonths ?? null,
      title: chunk.docTitle ?? chunk.docCode,
      sourceUrl: chunk.sourceUrl ?? null,
      content: chunk.content,
    }));
  }
}

export const trafficLawStrategy = new TrafficLawStrategy();
export default trafficLawStrategy;

"""Hierarchical Legal AST Parser for Vietnamese Traffic Legislation.

Parses hierarchical legal documents into structured Chapter > Article > Clause > Point AST trees.
"""

import re
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class LegalNodeType(str, Enum):
    DOCUMENT = "document"
    CHAPTER = "chapter"
    SECTION = "section"
    ARTICLE = "article"
    CLAUSE = "clause"
    POINT = "point"


@dataclass
class LegalASTNode:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    node_type: LegalNodeType = LegalNodeType.POINT
    doc_code: str = ""
    doc_title: str = ""
    chapter_number: str = ""
    chapter_title: str = ""
    section_number: str = ""
    section_title: str = ""
    article_number: Optional[int] = None
    article_title: str = ""
    clause_number: Optional[int] = None
    clause_text: str = ""
    point_code: Optional[str] = None
    point_text: str = ""
    raw_content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LegalPoint:
    point_code: str
    text: str
    raw_lines: List[str] = field(default_factory=list)


@dataclass
class LegalClause:
    clause_number: int
    text: str
    points: List[LegalPoint] = field(default_factory=list)
    raw_lines: List[str] = field(default_factory=list)


@dataclass
class LegalArticle:
    article_number: int
    title: str
    clauses: List[LegalClause] = field(default_factory=list)
    raw_lines: List[str] = field(default_factory=list)


@dataclass
class LegalChapter:
    chapter_number: str
    title: str
    section_number: str = ""
    section_title: str = ""
    articles: List[LegalArticle] = field(default_factory=list)


@dataclass
class LegalTree:
    doc_code: str
    doc_title: str
    chapters: List[LegalChapter] = field(default_factory=list)


class LegalNodeParser:
    """LlamaIndex-compatible Hierarchical AST parser for Vietnamese traffic decrees."""

    RE_CHAPTER = re.compile(r"^#+\s*(?:CHƯƠNG|Chương)\s+([IVXLCDM0-9]+)[:\.\-\s]*(.*)", re.IGNORECASE)
    RE_SECTION = re.compile(r"^#+\s*(?:MỤC|Mục)\s+([0-9IVXLCDM]+)[:\.\-\s]*(.*)", re.IGNORECASE)
    RE_ARTICLE = re.compile(r"^#+\s*(?:ĐIỀU|Điều)\s+([0-9]+)[:\.\-\s]*(.*)", re.IGNORECASE)
    RE_CLAUSE = re.compile(r"^(?:###\s*(?:Khoản\s*)?|([0-9]+)\.\s*)([0-9]+)?[\.\)\s]*(.*)", re.IGNORECASE)
    RE_POINT = re.compile(r"^(?:-\s*)?(?:Điểm\s*)?([a-zđĐ])[\)\.\s]+(.*)", re.IGNORECASE)

    def __init__(self, doc_code: str = "VN-LAW", doc_title: str = "Văn bản quy phạm pháp luật"):
        self.doc_code = doc_code
        self.doc_title = doc_title

    def parse_to_tree(self, markdown_text: str) -> LegalTree:
        lines = [line.rstrip() for line in markdown_text.splitlines()]
        tree = LegalTree(doc_code=self.doc_code, doc_title=self.doc_title)

        curr_chapter: Optional[LegalChapter] = None
        curr_section_num: str = ""
        curr_section_title: str = ""
        curr_article: Optional[LegalArticle] = None
        curr_clause: Optional[LegalClause] = None
        curr_point: Optional[LegalPoint] = None

        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                continue

            # 1. Match Chapter
            chap_match = self.RE_CHAPTER.match(trimmed)
            if chap_match:
                chap_num, chap_title = chap_match.group(1).strip(), chap_match.group(2).strip()
                curr_chapter = LegalChapter(chapter_number=chap_num, title=chap_title)
                tree.chapters.append(curr_chapter)
                curr_section_num = ""
                curr_section_title = ""
                curr_article = None
                curr_clause = None
                curr_point = None
                continue

            # 2. Match Section
            sec_match = self.RE_SECTION.match(trimmed)
            if sec_match:
                curr_section_num = sec_match.group(1).strip()
                curr_section_title = sec_match.group(2).strip()
                continue

            # 3. Match Article
            art_match = self.RE_ARTICLE.match(trimmed)
            if art_match:
                art_num_str, art_title = art_match.group(1).strip(), art_match.group(2).strip()
                art_num = int(art_num_str)
                curr_article = LegalArticle(article_number=art_num, title=art_title)
                if curr_chapter is None:
                    curr_chapter = LegalChapter(chapter_number="I", title="QUY ĐỊNH CHUNG")
                    tree.chapters.append(curr_chapter)
                curr_chapter.articles.append(curr_article)
                curr_clause = None
                curr_point = None
                continue

            # 4. Match Clause (Khoản X hoặc X. ...)
            # Check if line begins with integer followed by dot/paren or "Khoản X"
            clause_match = self._match_clause(trimmed)
            if clause_match:
                c_num, c_text = clause_match
                curr_clause = LegalClause(clause_number=c_num, text=c_text)
                if curr_article is None:
                    curr_article = LegalArticle(article_number=1, title="Quy định")
                    if curr_chapter is None:
                        curr_chapter = LegalChapter(chapter_number="I", title="QUY ĐỊNH CHUNG")
                        tree.chapters.append(curr_chapter)
                    curr_chapter.articles.append(curr_article)
                curr_article.clauses.append(curr_clause)
                curr_point = None
                continue

            # 5. Match Point (Điểm a, Điểm b, - Điểm a), ...)
            point_match = self.RE_POINT.match(trimmed)
            if point_match and curr_clause is not None:
                p_code, p_text = point_match.group(1).lower().strip(), point_match.group(2).strip()
                curr_point = LegalPoint(point_code=p_code, text=p_text)
                curr_clause.points.append(curr_point)
                continue

            # Content continuation line
            if curr_point is not None:
                curr_point.text += " " + trimmed
            elif curr_clause is not None:
                curr_clause.text += " " + trimmed
            elif curr_article is not None:
                curr_article.title += " " + trimmed

        return tree

    def _match_clause(self, line: str) -> Optional[tuple[int, str]]:
        # Match "### Khoản 1" or "Khoản 1." or "1. Phạt tiền..."
        m1 = re.match(r"^###\s*Khoản\s*([0-9]+)[:\.\s]*(.*)", line, re.IGNORECASE)
        if m1:
            return int(m1.group(1)), m1.group(2).strip()
        m2 = re.match(r"^([0-9]+)\.\s*(.*)", line)
        if m2:
            return int(m2.group(1)), m2.group(2).strip()
        m3 = re.match(r"^Khoản\s*([0-9]+)[:\.\s]*(.*)", line, re.IGNORECASE)
        if m3:
            return int(m3.group(1)), m3.group(2).strip()
        return None

    def parse_to_nodes(self, markdown_text: str) -> List[LegalASTNode]:
        tree = self.parse_to_tree(markdown_text)
        nodes: List[LegalASTNode] = []

        for chapter in tree.chapters:
            for article in chapter.articles:
                for clause in article.clauses:
                    if clause.points:
                        for point in clause.points:
                            node = LegalASTNode(
                                node_type=LegalNodeType.POINT,
                                doc_code=tree.doc_code,
                                doc_title=tree.doc_title,
                                chapter_number=chapter.chapter_number,
                                chapter_title=chapter.title,
                                section_number=chapter.section_number,
                                section_title=chapter.section_title,
                                article_number=article.article_number,
                                article_title=article.title,
                                clause_number=clause.clause_number,
                                clause_text=clause.text,
                                point_code=point.point_code,
                                point_text=point.text,
                                raw_content=f"Điểm {point.point_code}) {point.text}",
                            )
                            nodes.append(node)
                    else:
                        # Clause without specific sub-points
                        node = LegalASTNode(
                            node_type=LegalNodeType.CLAUSE,
                            doc_code=tree.doc_code,
                            doc_title=tree.doc_title,
                            chapter_number=chapter.chapter_number,
                            chapter_title=chapter.title,
                            section_number=chapter.section_number,
                            section_title=chapter.section_title,
                            article_number=article.article_number,
                            article_title=article.title,
                            clause_number=clause.clause_number,
                            clause_text=clause.text,
                            point_code=None,
                            point_text="",
                            raw_content=f"Khoản {clause.clause_number}. {clause.text}",
                        )
                        nodes.append(node)

        return nodes

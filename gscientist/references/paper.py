from dataclasses import dataclass, field, asdict
from datetime import date
from typing import List, Dict, Optional, Literal

# Define valid paper types
PaperType = Literal['journal', 'conference', 'preprint', 'book', 'thesis', 'report', 'unknown']

@dataclass
class Paper:
    doi: str
    title: str
    authors: List[str]
    institutions: List[str] = field(default_factory=list)
    abstract: Optional[str] = None
    published_date: Optional[date] = None
    pdf_url: Optional[str] = None
    url: Optional[str] = None
    source: Optional[str] = None
    publication: Optional[str] = None
    publisher: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    updated_date: Optional[date] = None
    categories: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    paper_references: Optional[List[str]] = None
    cites: Optional[List[str]] = None
    paper_type: Optional[PaperType] = None  # Type of the paper (journal, conference, preprint, etc.)
    bib: Optional[str] = None  # Bibliography entry in a standard format (BibTeX, RIS, etc.)
    extra: Optional[Dict] = None

    def __post_init__(self):
        if not self.title:
            raise ValueError("Title cannot be empty")
        if not self.doi:
            raise ValueError("DOI cannot be empty")
        # The default_factory already handles initialization for mutable fields
        # like lists and dicts if they are not provided.
        # However, if they are explicitly passed as None, we should initialize them.
        if self.institutions is None:
            self.institutions = []
        if self.categories is None:
            self.categories = []
        if self.keywords is None:
            self.keywords = []
        if self.paper_references is None:
            self.paper_references = []
        if self.cites is None:
            self.cites = []
        if self.paper_type is None:
            self.paper_type = 'unknown'  # Default paper type
        if self.extra is None:
            self.extra = {}

    def to_dict(self) -> Dict:
        """Serializes the dataclass to a dictionary, converting date objects to ISO format strings."""
        data = asdict(self)
        if self.published_date and isinstance(self.published_date, date):
            data['published_date'] = self.published_date.isoformat()
        if self.updated_date and isinstance(self.updated_date, date):
            data['updated_date'] = self.updated_date.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: Dict) -> 'Paper':
        """Creates a Paper instance from a dictionary."""
        # Convert date strings to date objects
        if isinstance(data.get('published_date'), str):
            data['published_date'] = date.fromisoformat(data['published_date'])
        if isinstance(data.get('updated_date'), str):
            data['updated_date'] = date.fromisoformat(data['updated_date'])
        
        return cls(**data)

    def __eq__(self, other: object) -> bool:
        """Two papers are considered equal if they have the same DOI."""
        if not isinstance(other, Paper):
            return NotImplemented
        return self.doi == other.doi

    def __hash__(self) -> int:
        """Hash is based on DOI to ensure consistency with equality."""
        return hash(self.doi)

    def __str__(self) -> str:
        """Returns a human-readable string representation of the paper."""
        authors_str = ", ".join(self.authors) if self.authors else "No authors"
        year = self.published_date.year if self.published_date else "No date"
        type_str = f" [{self.paper_type}]" if self.paper_type else ""
        return f"{authors_str} ({year}){type_str}. {self.title}. DOI: {self.doi}"
    
    def update(self, other: 'Paper') -> None:
        """Updates this paper's fields from another paper instance."""
        if self.doi != other.doi:
            raise ValueError("Cannot update from a paper with different DOI")
        
        for field in self.__dataclass_fields__:
            value = getattr(other, field)
            if value is not None:
                setattr(self, field, value)
    
    def merge(self, other: 'Paper') -> 'Paper':
        """Creates a new Paper instance by merging this paper with another."""
        if self.doi != other.doi:
            raise ValueError("Cannot merge papers with different DOIs")
        
        merged_data = self.to_dict()
        other_data = other.to_dict()
        
        for field, value in other_data.items():
            if value is not None:
                if isinstance(value, list):
                    # Merge lists without duplicates
                    existing = merged_data.get(field, [])
                    merged_data[field] = list(set(existing + value))
                elif isinstance(value, dict):
                    # Deep merge dictionaries
                    existing = merged_data.get(field, {})
                    merged_data[field] = {**existing, **value}
                else:
                    # For non-collection fields, prefer non-None values
                    if merged_data.get(field) is None:
                        merged_data[field] = value
        
        return Paper.from_dict(merged_data)

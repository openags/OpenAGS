"""
Academic paper search framework with standardized output format.
Currently supports: Arxiv
"""
from typing import List, Dict, Optional, Union
from dataclasses import dataclass
from datetime import datetime, timedelta
import time
import random
import logging
from pathlib import Path

import requests
import feedparser
import pandas as pd

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

@dataclass
class Paper:
    """Standardized paper format for all sources"""
    paper_id: str            # Unique identifier (e.g., arxiv id, doi)
    title: str              # Paper title
    authors: List[str]      # List of authors
    abstract: str           # Abstract text
    url: str               # URL to paper page
    pdf_url: str           # Direct PDF link if available
    published_date: datetime  # Publication date
    updated_date: datetime   # Last updated date
    source: str            # Source (e.g., 'arxiv', 'nature', 'science')
    categories: List[str]   # Subject categories
    keywords: List[str]     # Keywords if available
    doi: str              # DOI if available
    citations: int = 0     # Citation count if available
    references: List[str] = None  # Reference DOIs if available
    extra: Dict = None    # Source-specific extra information

    def to_dict(self) -> Dict:
        """Convert paper to dictionary format"""
        return {
            'paper_id': self.paper_id,
            'title': self.title,
            'authors': '; '.join(self.authors),
            'abstract': self.abstract,
            'url': self.url,
            'pdf_url': self.pdf_url,
            'published_date': self.published_date,
            'updated_date': self.updated_date,
            'source': self.source,
            'categories': '; '.join(self.categories),
            'keywords': '; '.join(self.keywords) if self.keywords else '',
            'doi': self.doi,
            'citations': self.citations,
            'references': '; '.join(self.references) if self.references else '',
            'extra': str(self.extra) if self.extra else ''
        }


class ArxivSearcher:
    """Arxiv paper search implementation"""
    
    BASE_URL = "http://export.arxiv.org/api/query"
    
    def __init__(self):
        """Initialize the searcher"""
        self.session = requests.Session()
        # Default settings
        self.max_results = 100
        self.sort_by = 'submittedDate'
        self.sort_order = 'descending'
        self.batch_size = 20
        self.delay = (2, 4)
        self.max_retries = 3
        self.retry_delay = 5
        
    def set_max_results(self, max_results: int) -> None:
        """Set maximum number of results to return"""
        self.max_results = max_results
        
    def set_sort(self, by: str = 'submittedDate', order: str = 'descending') -> None:
        """Set sort parameters"""
        valid_sort = ['relevance', 'lastUpdatedDate', 'submittedDate']
        if by not in valid_sort:
            raise ValueError(f"Sort by must be one of {valid_sort}")
        self.sort_by = by
        self.sort_order = order
        
    def set_batch_size(self, size: int) -> None:
        """Set batch size for API requests"""
        self.batch_size = min(size, 50)
        
    def set_delays(self, request_delay: tuple = (2, 4), retry_delay: int = 5) -> None:
        """Set delay parameters"""
        self.delay = request_delay
        self.retry_delay = retry_delay

    def _split_date_range(self, start_date: str, end_date: str, segments: int = 4) -> List[tuple]:
        """Split date range into smaller segments for better retrieval"""
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        # Calculate segment size
        total_days = (end - start).days
        segment_days = total_days // segments
        
        date_ranges = []
        for i in range(segments):
            segment_start = start + timedelta(days=i * segment_days)
            segment_end = start + timedelta(days=(i + 1) * segment_days - 1)
            if i == segments - 1:  # Make sure the last segment reaches the end date
                segment_end = end
            date_ranges.append((
                segment_start.strftime('%Y-%m-%d'),
                segment_end.strftime('%Y-%m-%d')
            ))
            
        return date_ranges

    def search(self, 
              query: str,
              start_date: Optional[str] = None,
              end_date: Optional[str] = None,
              categories: Optional[List[str]] = None) -> List[Paper]:
        """
        Search Arxiv papers with date segmentation strategy
        """
        all_results = []
        date_ranges = []
        
        if start_date and end_date:
            date_ranges = self._split_date_range(start_date, end_date)
        else:
            date_ranges = [(start_date, end_date)]
            
        for date_start, date_end in date_ranges:
            try:
                segment_results = self._search_segment(
                    query=query,
                    start_date=date_start,
                    end_date=date_end,
                    categories=categories
                )
                # Filter out None values
                valid_results = [r for r in segment_results if r is not None]
                all_results.extend(valid_results)
                
                if len(all_results) >= self.max_results:
                    break
                    
                # Add delay between segments
                time.sleep(random.uniform(*self.delay))
                
            except Exception as e:
                logging.error(f"Error searching segment {date_start} to {date_end}: {e}")
                continue
        
        # Filter and sort results
        valid_results = [r for r in all_results if r is not None and r.published_date is not None]
        sorted_results = sorted(
            valid_results,
            key=lambda x: x.published_date,
            reverse=True
        )
        
        return sorted_results[:self.max_results]

    def _search_segment(self, 
                       query: str,
                       start_date: Optional[str],
                       end_date: Optional[str],
                       categories: Optional[List[str]]) -> List[Paper]:
        """Search within a specific date segment"""
        search_query = self._build_query(query, categories, start_date, end_date)
        results = []
        start_idx = 0
        
        while len(results) < self.max_results:
            try:
                current_batch = min(self.batch_size, self.max_results - len(results))
                logging.info(f"Fetching results {start_idx + 1} to {start_idx + current_batch} "
                           f"for period {start_date} to {end_date}")
                
                batch = self._fetch_batch(search_query, start_idx, current_batch)
                
                if not batch:
                    break
                    
                results.extend(batch)
                logging.info(f"Total results in current segment: {len(results)}")
                
                if len(batch) < current_batch:
                    break
                    
                start_idx += len(batch)
                time.sleep(random.uniform(*self.delay))
                
            except Exception as e:
                logging.error(f"Error fetching batch: {e}")
                break
                
        return results
        
    def _build_query(self, 
                    query: str,
                    categories: Optional[List[str]] = None,
                    start_date: Optional[str] = None,
                    end_date: Optional[str] = None) -> str:
        """Build Arxiv API query string"""
        query_parts = []
        
        # Add main search terms
        query_parts.append(query)
        
        # Add date constraints
        if start_date and end_date:
            date_query = f"submittedDate:[{start_date.replace('-','')}0000 TO {end_date.replace('-','')}2359]"
            query_parts.append(date_query)
        
        # Only add category filter if specifically requested
        if categories and len(categories) > 0:
            cat_query = ' OR '.join(categories)
            query_parts.append(f"cat:({cat_query})")
        
        final_query = ' AND '.join(f"({part})" for part in query_parts if part)
        logging.debug(f"Built query: {final_query}")
        return final_query

    def _fetch_batch(self, search_query: str, start: int, batch_size: int) -> List[Paper]:
        """Fetch a batch of results from Arxiv API with retries"""
        params = {
            'search_query': search_query,
            'start': start,
            'max_results': batch_size,
            'sortBy': self.sort_by,
            'sortOrder': self.sort_order
        }
        
        logging.debug(f"Requesting with params: {params}")
        
        for attempt in range(self.max_retries):
            try:
                response = self.session.get(self.BASE_URL, params=params)
                response.raise_for_status()
                feed = feedparser.parse(response.content)
                
                if 'status' in feed and feed.status != 200:
                    raise Exception(f"API Error: {feed.get('status', '')}")
                    
                papers = [self._parse_entry(entry) for entry in feed.entries]
                return [p for p in papers if p is not None]  # Filter out None results
                
            except Exception as e:
                logging.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                else:
                    raise
        
        return []

    def _parse_entry(self, entry: Dict) -> Optional[Paper]:
        """Parse Arxiv entry into standardized Paper format"""
        try:
            # Extract authors
            authors = [author.get('name', '').strip() for author in entry.get('authors', [])]
            if not authors:
                return None
            
            # Extract dates
            try:
                published = datetime.strptime(entry.get('published', ''), '%Y-%m-%dT%H:%M:%SZ')
                updated = datetime.strptime(entry.get('updated', ''), '%Y-%m-%dT%H:%M:%SZ')
            except (ValueError, TypeError):
                return None
            
            # Extract title
            title = entry.get('title', '').replace('\n', ' ').strip()
            if not title:
                return None
            
            # Extract categories
            categories = [tag.get('term', '').strip() for tag in entry.get('tags', [])]
            
            # Extract PDF URL
            pdf_url = ''
            for link in entry.get('links', []):
                if link.get('type', '') == 'application/pdf':
                    pdf_url = link.get('href', '')
                    break
            
            return Paper(
                paper_id=entry.get('id', '').split('/')[-1],
                title=title,
                authors=authors,
                abstract=entry.get('summary', '').replace('\n', ' ').strip(),
                url=entry.get('id', ''),
                pdf_url=pdf_url,
                published_date=published,
                updated_date=updated,
                source='arxiv',
                categories=categories,
                keywords=[],
                doi=entry.get('doi', ''),
                extra={
                    'primary_category': entry.get('arxiv_primary_category', {}).get('term', ''),
                    'journal_ref': entry.get('journal_ref', '')
                }
            )
        except Exception as e:
            logging.error(f"Error parsing entry: {e}")
            return None

    @staticmethod
    def save_papers(papers: List[Paper], 
                   filepath: Union[str, Path],
                   format: str = 'csv') -> None:
        """Save papers to file"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        # Convert papers to list of dicts
        data = [paper.to_dict() for paper in papers]
        
        if format.lower() == 'csv':
            pd.DataFrame(data).to_csv(filepath, index=False, encoding='utf-8')
        elif format.lower() == 'json':
            import json
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)
        elif format.lower() == 'excel':
            pd.DataFrame(data).to_excel(filepath, index=False)
        else:
            raise ValueError(f"Unsupported format: {format}")
        
        logging.info(f"Saved {len(papers)} papers to {filepath}")

    def download_pdf(self, paper_id: str, save_path: Union[str, Path]) -> Path:
        """
        Download PDF file for a given arxiv paper ID and save it to the specified directory
        
        Args:
            paper_id (str): The arxiv paper ID (e.g., '2304.12244')
            save_path (Union[str, Path]): Directory path where to save the PDF file
            
        Returns:
            Path: Path to the downloaded PDF file
            
        Raises:
            Exception: If download fails after max retries
        """
        save_dir = Path(save_path)
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # Use paper_id as filename
        output_file = save_dir / f"{paper_id}.pdf"
            
        # Construct PDF URL
        pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
        
        for attempt in range(self.max_retries):
            try:
                logging.info(f"Downloading PDF for paper {paper_id}")
                response = self.session.get(pdf_url, stream=True)
                response.raise_for_status()
                
                # Save the PDF file
                with open(output_file, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                
                logging.info(f"Successfully downloaded PDF to {output_file}")
                return output_file
                
            except Exception as e:
                logging.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(self.retry_delay)
                else:
                    raise Exception(f"Failed to download PDF for paper {paper_id} after {self.max_retries} attempts")
        
        raise Exception("Unexpected error in download_pdf")

def main():
    # Setup logging for debugging
    logging.getLogger().setLevel(logging.DEBUG)
    
    # Initialize searcher
    searcher = ArxivSearcher()
    searcher.set_max_results(100)
    searcher.set_batch_size(20)
    
    # Search with date segments
    papers = searcher.search(
        query='machine learning',
        start_date='2023-01-01',
        end_date='2024-01-01'
    )
    
    print(f"\nTotal papers found: {len(papers)}")
    
    # Print some results
    for paper in papers[:3]:
        print(f"\nTitle: {paper.title}")
        print(f"Authors: {', '.join(paper.authors)}")
        print(f"Published: {paper.published_date}")
        print(f"Categories: {', '.join(paper.categories)}")
        print("---")
    
    # Save results
    ArxivSearcher.save_papers(papers, 'arxiv_papers.csv')

if __name__ == '__main__':
    main()
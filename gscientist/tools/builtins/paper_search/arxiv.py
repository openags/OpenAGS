"""
Academic paper search framework using arXiv API
"""
from typing import List, Optional
from datetime import datetime, date
import os
from pathlib import Path

import requests
import feedparser
from PyPDF2 import PdfReader

from gscientist.references.paper import Paper

class ArxivSearcher:
    """Searcher for arXiv papers"""
    BASE_URL = "http://export.arxiv.org/api/query"

    def search(self, query: str, max_results: int = 10) -> List[Paper]:
        """Search arXiv papers.
        
        Args:
            query: The search query string
            max_results: Maximum number of results to return
            
        Returns:
            List of Paper objects matching the search criteria
        """
        params = {
            'search_query': query,
            'max_results': max_results,
            'sortBy': 'submittedDate',
            'sortOrder': 'descending'
        }
        
        response = requests.get(self.BASE_URL, params=params)
        feed = feedparser.parse(response.content)
        papers = []
        
        for entry in feed.entries:
            try:
                # Extract authors
                authors = [author.name for author in entry.authors]
                
                # Extract dates
                published_datetime = datetime.strptime(entry.published, '%Y-%m-%dT%H:%M:%SZ')
                published_date = date(published_datetime.year, published_datetime.month, published_datetime.day)
                
                updated_datetime = datetime.strptime(entry.updated, '%Y-%m-%dT%H:%M:%SZ')
                updated_date = date(updated_datetime.year, updated_datetime.month, updated_datetime.day)
                
                # Extract PDF URL
                pdf_url = next((link.href for link in entry.links if link.type == 'application/pdf'), '')
                
                # Extract arXiv ID to use as DOI if no DOI available
                arxiv_id = entry.id.split('/')[-1]
                doi = entry.get('doi', f"arxiv:{arxiv_id}")
                
                papers.append(Paper(
                    doi=doi,
                    title=entry.title.replace('\n', ' ').strip(),
                    authors=authors,
                    abstract=entry.summary.replace('\n', ' ').strip(),
                    url=entry.id,
                    pdf_url=pdf_url,
                    published_date=published_date,
                    updated_date=updated_date,
                    source='arxiv',
                    categories=[tag.term for tag in entry.tags],
                    paper_type='preprint',
                    extra={
                        'arxiv_id': arxiv_id,
                        'primary_category': entry.get('arxiv_primary_category', {}).get('term', '')
                    }                ))
            except Exception as e:
                print(f"Error parsing arXiv entry: {e}")
        
        return papers

    def download_pdf(self, paper_id: str, save_path: str) -> str:
        """Download PDF for a given arXiv paper ID.
        
        Args:
            paper_id: arXiv paper ID
            save_path: Directory where to save the PDF
            
        Returns:
            Path to the downloaded PDF file
        """
        os.makedirs(save_path, exist_ok=True)
        pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
        output_file = f"{save_path}/{paper_id}.pdf"
        
        response = requests.get(pdf_url)
        response.raise_for_status()
        
        with open(output_file, 'wb') as f:
            f.write(response.content)
        
        return output_file

    def read_paper(self, paper_id: str, save_path: str = "./downloads") -> str:
        """Read a paper and convert it to text format.
        
        Args:
            paper_id: arXiv paper ID
            save_path: Directory where the PDF is/will be saved
            
        Returns:
            The extracted text content of the paper
        """
        # First ensure we have the PDF
        pdf_path = f"{save_path}/{paper_id}.pdf"
        if not os.path.exists(pdf_path):
            pdf_path = self.download_pdf(paper_id, save_path)
        
        # Read the PDF
        try:
            reader = PdfReader(pdf_path)
            text = ""
            
            # Extract text from each page
            for page in reader.pages:
                text += page.extract_text() + "\n"            
            return text.strip()
        except Exception as e:
            print(f"Error reading PDF for paper {paper_id}: {e}")
            return ""
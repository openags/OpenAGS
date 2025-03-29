"""
Enhanced Google Scholar scraper with proxy support and robust error handling
"""
import requests
from bs4 import BeautifulSoup
import csv
import time
import random
from typing import Optional, List, Dict, Tuple, Any
from dataclasses import dataclass
import logging
from pathlib import Path
import html5lib
from datetime import datetime
from fake_useragent import UserAgent

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('scholar_scraper.log'),
        logging.StreamHandler()
    ]
)

@dataclass
class ProxyConfig:
    """Proxy configuration settings"""
    use_proxy: bool = True
    proxy_sources: List[str] = None
    max_retries: int = 3
    timeout: int = 10

    def __post_init__(self):
        if self.proxy_sources is None:
            self.proxy_sources = [
                'https://www.sslproxies.org',
                'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
                'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt'
            ]

@dataclass
class ScraperConfig:
    """Scraper configuration settings"""
    delay_range: Tuple[int, int] = (3, 7)
    max_retries: int = 5
    timeout: int = 30
    batch_size: int = 10
    save_batch: bool = True

class ProxyManager:
    """Manages proxy rotation and validation"""
    
    def __init__(self, config: ProxyConfig):
        self.config = config
        self.proxies: List[Dict[str, str]] = []
        self.current_proxy: Optional[Dict[str, str]] = None
        self.ua = UserAgent()
        
    def _fetch_proxies_from_sslproxies(self) -> List[Dict[str, str]]:
        """Fetch proxies from sslproxies.org"""
        try:
            response = requests.get('https://www.sslproxies.org')
            soup = BeautifulSoup(response.content, 'html5lib')
            
            proxies = []
            for i in range(0, len(soup.find_all('td')[::8])):
                ip = soup.find_all('td')[::8][i].text
                port = soup.find_all('td')[1::8][i].text
                proxy = f'{ip}:{port}'
                proxies.append({'https': f'https://{proxy}', 'http': f'http://{proxy}'})
            
            return proxies
        except Exception as e:
            logging.error(f"Error fetching proxies from sslproxies.org: {e}")
            return []

    def _fetch_proxies_from_github(self, url: str) -> List[Dict[str, str]]:
        """Fetch proxies from GitHub proxy lists"""
        try:
            response = requests.get(url)
            proxies = []
            for line in response.text.split('\n'):
                if line.strip():
                    proxy = line.strip()
                    proxies.append({
                        'https': f'https://{proxy}',
                        'http': f'http://{proxy}'
                    })
            return proxies
        except Exception as e:
            logging.error(f"Error fetching proxies from {url}: {e}")
            return []

    def refresh_proxies(self):
        """Refresh the proxy pool"""
        self.proxies = []
        
        # Fetch from all sources
        for source in self.config.proxy_sources:
            if 'sslproxies.org' in source:
                self.proxies.extend(self._fetch_proxies_from_sslproxies())
            else:
                self.proxies.extend(self._fetch_proxies_from_github(source))
                
        logging.info(f"Refreshed proxy pool. Total proxies: {len(self.proxies)}")

    def get_proxy(self) -> Dict[str, str]:
        """Get a working proxy"""
        if not self.proxies:
            self.refresh_proxies()
            
        while self.proxies:
            proxy = random.choice(self.proxies)
            if self._test_proxy(proxy):
                self.current_proxy = proxy
                return proxy
            self.proxies.remove(proxy)
            
        raise Exception("No working proxies available")

    def _test_proxy(self, proxy: Dict[str, str]) -> bool:
        """Test if a proxy is working"""
        try:
            response = requests.get(
                'https://scholar.google.com',
                proxies=proxy,
                timeout=self.config.timeout,
                headers={'User-Agent': self.ua.random}
            )
            return response.status_code == 200
        except:
            return False

class ScholarScraper:
    """Enhanced Google Scholar scraper with proxy support"""
    
    def __init__(self, proxy_config: ProxyConfig, scraper_config: ScraperConfig):
        self.proxy_manager = ProxyManager(proxy_config)
        self.config = scraper_config
        self.ua = UserAgent()
        self.session = requests.Session()
        
    def _get_headers(self) -> Dict[str, str]:
        """Get random headers"""
        return {
            'User-Agent': self.ua.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        }

    def _make_request(self, url: str, params: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """Make a request with retry and proxy rotation"""
        for attempt in range(self.config.max_retries):
            try:
                proxy = self.proxy_manager.get_proxy() if self.proxy_manager.config.use_proxy else None
                
                response = self.session.get(
                    url,
                    params=params,
                    headers=self._get_headers(),
                    proxies=proxy,
                    timeout=self.config.timeout
                )
                
                if response.status_code == 200:
                    return response.text
                elif response.status_code == 429:
                    logging.warning(f"Rate limited. Waiting {(attempt + 1) * 10} seconds...")
                    time.sleep((attempt + 1) * 10)
                else:
                    logging.warning(f"Request failed with status code: {response.status_code}")
                    
            except Exception as e:
                logging.error(f"Request failed: {e}")
                self.proxy_manager.refresh_proxies()
                
            # Random delay between attempts
            time.sleep(random.uniform(*self.config.delay_range))
            
        return None

    def _parse_paper_details(self, result_div: BeautifulSoup) -> Dict[str, Any]:
        """Parse paper details from a result div"""
        try:
            # Extract title and link
            title_elem = result_div.select_one(".gs_rt a")
            title = title_elem.text if title_elem else "No title"
            url = title_elem['href'] if title_elem else None
            
            # Extract author information
            author_elem = result_div.select_one(".gs_a")
            author_text = author_elem.text if author_elem else ""
            
            # Extract year
            year = None
            if author_text:
                year_match = re.search(r'\b(19|20)\d{2}\b', author_text)
                if year_match:
                    year = int(year_match.group(0))
            
            # Extract citations
            citations_elem = result_div.select_one(".gs_fl")
            citations = 0
            if citations_elem:
                citations_text = citations_elem.text
                citations_match = re.search(r'Cited by (\d+)', citations_text)
                if citations_match:
                    citations = int(citations_match.group(1))
            
            # Extract abstract
            abstract_elem = result_div.select_one(".gs_rs")
            abstract = abstract_elem.text if abstract_elem else "No abstract"
            
            return {
                'title': title,
                'url': url,
                'authors': author_text,
                'year': year,
                'citations': citations,
                'abstract': abstract
            }
        except Exception as e:
            logging.error(f"Error parsing paper details: {e}")
            return None

    def search(self, query: str, max_results: int = 100) -> List[Dict[str, Any]]:
        """Search Google Scholar and return results"""
        results = []
        start = 0
        
        while start < max_results:
            logging.info(f"Fetching results {start + 1} to {start + self.config.batch_size}")
            
            html = self._make_request(
                'https://scholar.google.com/scholar',
                params={
                    'q': query,
                    'start': start,
                    'hl': 'en',
                    'as_sdt': '0,5'
                }
            )
            
            if not html:
                break
                
            soup = BeautifulSoup(html, 'html.parser')
            result_divs = soup.select(".gs_r.gs_or.gs_scl")
            
            if not result_divs:
                break
                
            batch_results = []
            for div in result_divs:
                paper_details = self._parse_paper_details(div)
                if paper_details:
                    batch_results.append(paper_details)
                    
            results.extend(batch_results)
            
            # Save batch if enabled
            if self.config.save_batch and batch_results:
                self._save_batch(batch_results)
                
            # Break if we got fewer results than batch size
            if len(batch_results) < self.config.batch_size:
                break
                
            start += self.config.batch_size
            time.sleep(random.uniform(*self.config.delay_range))
            
        return results[:max_results]

    def _save_batch(self, batch: List[Dict[str, Any]]):
        """Save a batch of results to CSV"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filepath = Path(f'scholar_results_{timestamp}.csv')
        
        # Create file with headers if it doesn't exist
        if not filepath.exists():
            fieldnames = ['title', 'url', 'authors', 'year', 'citations', 'abstract']
            with open(filepath, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
        
        # Append batch results
        with open(filepath, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writerows(batch)

def main():
    # Configuration
    proxy_config = ProxyConfig(
        use_proxy=True,
        max_retries=3,
        timeout=10
    )
    
    scraper_config = ScraperConfig(
        delay_range=(3, 7),
        max_retries=5,
        batch_size=10,
        save_batch=True
    )
    
    # Initialize scraper
    scraper = ScholarScraper(proxy_config, scraper_config)
    
    # Example search
    query = ('("ChatGPT" OR "GPT*") AND ("ESL writing" OR "EFL writing" OR '
            '"Second language writing" OR "L2 writing") AND (assessment OR rating)')
    
    try:
        results = scraper.search(query, max_results=100)
        logging.info(f"Successfully retrieved {len(results)} results")
    except Exception as e:
        logging.error(f"Search failed: {e}")

if __name__ == "__main__":
    main()
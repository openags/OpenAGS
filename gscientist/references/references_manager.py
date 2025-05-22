import sqlite3
import json
import yaml
from typing import List, Dict, Any, Optional
from pathlib import Path
from .paper import Paper

class ReferencesManager:
    def __init__(self, global_db_path: str, projects_file_path: str):
        self.global_db_path = global_db_path
        self.projects_file_path = projects_file_path
        self.create_global_database()

    def load_projects(self) -> List[Dict]:
        """Reads the YAML file and returns the list of projects with their configurations."""
        try:
            with open(self.projects_file_path, 'r') as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    self.global_config = data.get('global', {})
                    return data.get('projects', [])
                return []
        except FileNotFoundError:
            return []
        except yaml.YAMLError:
            return []

    def validate_project_name(self, project_name: str) -> bool:
        """Validates if a project name exists in the loaded projects."""
        projects = self.load_projects()
        return any(project.get('name') == project_name for project in projects)

    def get_project_db_path(self, project_name: str) -> Optional[str]:
        """Get the local references.db path for a project."""
        projects = self.load_projects()
        for project in projects:
            if project.get('name') == project_name:
                project_path = Path(project.get('path', ''))
                db_rel_path = project.get('structure', {}).get('references', {}).get('database', '')
                if db_rel_path:
                    return str(project_path / db_rel_path)
        return None

    def create_global_database(self):
        """Create the global papers.db and table."""
        conn = sqlite3.connect(self.global_db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS papers (
                doi TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                authors TEXT,
                institutions TEXT,
                abstract TEXT,
                published_date TEXT,
                pdf_url TEXT,
                url TEXT,
                source TEXT,
                publication TEXT,
                publisher TEXT,
                volume TEXT,
                issue TEXT,
                pages TEXT,
                updated_date TEXT,
                categories TEXT,
                keywords TEXT,
                paper_references TEXT,
                cites TEXT,
                paper_type TEXT,
                bib TEXT,
                extra TEXT
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi)')
        conn.commit()
        conn.close()

    def create_project_references_db(self, project_db_path: str):
        """Create the local project references.db and table."""
        conn = sqlite3.connect(project_db_path)
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS references (
                doi TEXT PRIMARY KEY
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_references_doi ON references(doi)')
        conn.commit()
        conn.close()

    def insert_papers_to_global_db(self, papers: List[Paper]):
        """Insert papers into the global papers.db."""
        conn = sqlite3.connect(self.global_db_path)
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            for paper in papers:
                if not isinstance(paper, Paper):
                    raise TypeError("All items in 'papers' must be Paper objects")

                paper_dict = paper.to_dict()
                # Convert references field to paper_references to avoid SQLite keyword conflict
                if 'references' in paper_dict:
                    paper_dict['paper_references'] = paper_dict.pop('references')
                
                json_fields = ['authors', 'institutions', 'categories', 'keywords', 'paper_references', 'cites', 'extra']
                for key in json_fields:
                    if key in paper_dict and paper_dict[key] is not None:
                        paper_dict[key] = json.dumps(paper_dict[key])

                paper_columns = list(paper_dict.keys())
                paper_values = [paper_dict.get(col) for col in paper_columns]
                placeholders = ', '.join(['?'] * len(paper_columns))
                sql = f"INSERT OR REPLACE INTO papers ({', '.join(paper_columns)}) VALUES ({placeholders})"
                cursor.execute(sql, paper_values)

            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def insert_papers_to_project_db(self, project_name: str, papers: List[Paper]):
        """Insert paper DOIs into the project's references.db."""
        if not self.validate_project_name(project_name):
            raise ValueError(f"Project '{project_name}' not found in '{self.projects_file_path}'")

        project_db_path = self.get_project_db_path(project_name)
        if not project_db_path:
            raise ValueError(f"Project '{project_name}' has no references database path")

        self.create_project_references_db(project_db_path)

        conn = sqlite3.connect(project_db_path)
        cursor = conn.cursor()
        try:
            conn.execute('BEGIN TRANSACTION')
            for paper in papers:
                if not isinstance(paper, Paper):
                    raise TypeError("All items in 'papers' must be Paper objects")
                cursor.execute("INSERT OR REPLACE INTO references (doi) VALUES (?)", (paper.doi,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    def _fetch_papers(self, conn: sqlite3.Connection, dois: Optional[List[str]] = None) -> List[Dict]:
        """Helper function: query papers from the database, supports adaptive fields."""
        cursor = conn.cursor()
        cursor.execute('PRAGMA table_info(papers)')
        columns = [info[1] for info in cursor.fetchall()]

        papers = []
        json_fields = {'authors', 'institutions', 'categories', 'keywords', 'paper_references', 'cites', 'extra'}

        if dois:
            placeholders = ','.join(['?'] * len(dois))
            cursor.execute(f"SELECT * FROM papers WHERE doi IN ({placeholders})", dois)
        else:
            cursor.execute("SELECT * FROM papers")

        for row in cursor.fetchall():
            paper = {}
            for i, col_name in enumerate(columns):
                value = row[i]
                if col_name in json_fields and value is not None:
                    try:
                        paper[col_name] = json.loads(value) if value else ([] if col_name != 'extra' else {})
                    except json.JSONDecodeError:
                        paper[col_name] = [] if col_name != 'extra' else {}
                else:
                    paper[col_name] = value
                
            # Convert paper_references back to references to maintain compatibility with Paper class
            if 'paper_references' in paper:
                paper['references'] = paper.pop('paper_references')
            
            papers.append(paper)

        return papers

    def get_papers_from_global_db(self, dois: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Query papers from the global papers.db, supports single or multiple DOIs."""
        conn = sqlite3.connect(self.global_db_path)
        papers = self._fetch_papers(conn, dois)
        conn.close()
        return papers

    def get_project_papers(self, project_name: str) -> List[Dict[str, Any]]:
        """Get DOIs from the project's references.db and paper details from the global papers.db."""
        if not self.validate_project_name(project_name):
            raise ValueError(f"Project '{project_name}' not found in '{self.projects_file_path}'")

        project_db_path = self.get_project_db_path(project_name)
        if not project_db_path:
            raise ValueError(f"Project '{project_name}' has no references database path")

        conn = sqlite3.connect(project_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT doi FROM references")
        dois = [row[0] for row in cursor.fetchall()]
        conn.close()

        if not dois:
            return []

        return self.get_papers_from_global_db(dois)

    def delete_project_papers(self, project_name: str):
        """Delete all paper references from a project."""
        if not self.validate_project_name(project_name):
            raise ValueError(f"Project '{project_name}' not found in '{self.projects_file_path}'")

        project_db_path = self.get_project_db_path(project_name)
        if not project_db_path:
            raise ValueError(f"Project '{project_name}' has no references database path")

        conn = sqlite3.connect(project_db_path)
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM references")
            conn.commit()
        except sqlite3.Error as e:
            raise e
        finally:
            conn.close()

    def search_papers(self, query: str, project_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search papers, supports project-specific or global search."""
        conn = sqlite3.connect(self.global_db_path)
        cursor = conn.cursor()

        dois = None
        if project_name:
            if not self.validate_project_name(project_name):
                raise ValueError(f"Project '{project_name}' not found")
            project_db_path = self.get_project_db_path(project_name)
            if not project_db_path:
                raise ValueError(f"Project '{project_name}' has no references database path")

            conn_project = sqlite3.connect(project_db_path)
            cursor_project = conn_project.cursor()
            cursor_project.execute("SELECT doi FROM references")
            dois = [row[0] for row in cursor_project.fetchall()]
            conn_project.close()

            if not dois:
                conn.close()
                return []

            placeholders = ','.join(['?'] * len(dois))
            search_term = f"%{query}%"
            sql = f'''
                SELECT * FROM papers
                WHERE doi IN ({placeholders}) AND (
                    title LIKE ? OR
                    authors LIKE ? OR
                    abstract LIKE ? OR
                    keywords LIKE ?
                )
            '''
            cursor.execute(sql, dois + [search_term, search_term, search_term, search_term])
        else:
            search_term = f"%{query}%"
            sql = '''
                SELECT * FROM papers WHERE
                    title LIKE ? OR
                    authors LIKE ? OR
                    abstract LIKE ? OR
                    keywords LIKE ?
            '''
            cursor.execute(sql, (search_term, search_term, search_term, search_term))

        # Only return papers that meet the criteria
        papers = []
        json_fields = {'authors', 'institutions', 'categories', 'keywords', 'paper_references', 'cites', 'extra'}
        columns = [desc[0] for desc in cursor.description]
        for row in cursor.fetchall():
            paper = {}
            for i, col_name in enumerate(columns):
                value = row[i]
                if col_name in json_fields and value is not None:
                    try:
                        paper[col_name] = json.loads(value) if value else ([] if col_name != 'extra' else {})
                    except json.JSONDecodeError:
                        paper[col_name] = [] if col_name != 'extra' else {}
                else:
                    paper[col_name] = value
            
            # Convert paper_references back to references to maintain compatibility with Paper class
            if 'paper_references' in paper:
                paper['references'] = paper.pop('paper_references')
            
            papers.append(paper)
        conn.close()
        return papers

    def get_paper(self, doi: str) -> Optional[Dict[str, Any]]:
        """Get a single paper by DOI."""
        conn = sqlite3.connect(self.global_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM papers WHERE doi = ?", (doi,))
        papers = self._fetch_papers(conn, [doi])
        conn.close()
        return papers[0] if papers else None

    def remove_paper_from_project(self, project_name: str, doi: str) -> bool:
        """Remove a paper from the project's references.db."""
        if not self.validate_project_name(project_name):
            raise ValueError(f"Project '{project_name}' not found in '{self.projects_file_path}'")

        project_db_path = self.get_project_db_path(project_name)
        if not project_db_path:
            raise ValueError(f"Project '{project_name}' has no references database path")

        conn = sqlite3.connect(project_db_path)
        cursor = conn.cursor()
        try:
            cursor.execute("DELETE FROM references WHERE doi = ?", (doi,))
            conn.commit()
            return cursor.rowcount > 0
        except sqlite3.Error as e:
            raise e
        finally:
            conn.close()

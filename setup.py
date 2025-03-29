from setuptools import setup, find_packages

setup(
    name='auto-research',
    version='0.1.0',
    description='Automated research assistant system',
    author='Your Name',
    packages=find_packages(include=['gscientist', 'gscientist.*']),  # Only include the gscientist package
    python_requires='>=3.8',  # Specify the minimum Python version
)
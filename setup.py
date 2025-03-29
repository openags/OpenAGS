from setuptools import setup, find_packages

setup(
    name='auto-research',
    version='0.1.0',
    description='Automated research assistant system',
    author='Your Name',
    packages=find_packages(),
    install_requires=[
        'pytest>=7.0.0',
        'gscientist>=0.1.0',
    ],
    python_requires='>=3.8',
)
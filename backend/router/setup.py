import sys
from setuptools import setup, Extension
import pybind11

# Default to GCC flags (Linux/Mac/MinGW)
cpp_args = ['-O3', '-Wall', '-std=c++17']

# Only switch to MSVC flags if we are NOT using MinGW
if sys.platform == "win32" and "gcc" not in sys.version.lower():
    # Check if user is forcing MinGW via command line
    is_mingw = False
    for arg in sys.argv:
        if "mingw" in arg:
            is_mingw = True
            break
    
    if not is_mingw:
        cpp_args = ['/O2', '/std:c++17']

ext_modules = [
    Extension(
        'rescunet',
        ['router.cpp'],
        include_dirs=[pybind11.get_include()],
        language='c++',
        extra_compile_args=cpp_args,
    ),
]

setup(
    name='rescunet',
    version='1.0',
    author='Youssef Elebiary',
    description='High-performance C++ routing for RescuNet',
    ext_modules=ext_modules,
    zip_safe=False,
)
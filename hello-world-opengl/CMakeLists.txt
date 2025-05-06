cmake_minimum_required(VERSION 3.10)
project(OpenGLWindow)

set(CMAKE_CXX_STANDARD 17)

find_package(glfw3 REQUIRED)
find_package(OpenGL REQUIRED)

include_directories(include)

add_executable(opengl-window src/hello_window.cpp src/glad.c)

target_link_libraries(opengl-window glfw ${OPENGL_gl_LIBRARY})

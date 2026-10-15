# Builds the Page Turn Pro After Effects effect (macOS, arm64 + x86_64).
#   cmake -S effect -B effect/build -DAE_SDK=/path/to/AfterEffectsSDK/Examples
#   cmake --build effect/build --config Release
# The rendering core and its off-host test build anywhere: -DPTP_TEST_ONLY=ON.
cmake_minimum_required(VERSION 3.20)
project(PageTurnPro CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

option(PTP_TEST_ONLY "Only build the core test renderer (no After Effects SDK needed)" OFF)

add_executable(render_core test/render_core.cpp)

if(PTP_TEST_ONLY)
  return()
endif()

if(NOT APPLE)
  message(FATAL_ERROR "Only the macOS build is set up. Use -DPTP_TEST_ONLY=ON elsewhere.")
endif()

set(AE_SDK "" CACHE PATH "After Effects SDK 'Examples' folder (contains Headers, Resources, Util)")
if(NOT EXISTS "${AE_SDK}/Headers/AE_Effect.h")
  message(FATAL_ERROR "Set -DAE_SDK to the SDK's Examples folder (looked for ${AE_SDK}/Headers/AE_Effect.h)")
endif()

set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "" FORCE)
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "" FORCE)

set(SDK_INCLUDES
  "${AE_SDK}/Headers"
  "${AE_SDK}/Headers/SP"
  "${AE_SDK}/Headers/adobesdk"
  "${AE_SDK}/Resources"
  "${AE_SDK}/Util")

# PiPL resource, compiled by Rez into the bundle's Resources folder.
set(PIPL_RSRC "${CMAKE_CURRENT_BINARY_DIR}/PageTurnPro.rsrc")
set(REZ_INCLUDES "")
foreach(dir ${SDK_INCLUDES} "${CMAKE_CURRENT_SOURCE_DIR}/src")
  list(APPEND REZ_INCLUDES -i "${dir}")
endforeach()
add_custom_command(
  OUTPUT "${PIPL_RSRC}"
  COMMAND xcrun Rez -o "${PIPL_RSRC}" -define __MACH__ -arch arm64 -arch x86_64 ${REZ_INCLUDES}
          -isysroot "${CMAKE_OSX_SYSROOT}" -useDF "${CMAKE_CURRENT_SOURCE_DIR}/src/PageTurnProPiPL.r"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/PageTurnProPiPL.r"
  COMMENT "Compiling PiPL")
set_source_files_properties("${PIPL_RSRC}" PROPERTIES MACOSX_PACKAGE_LOCATION Resources GENERATED TRUE)

add_library(PageTurnPro MODULE src/PageTurnPro.cpp src/PageTurnPro.h src/PageTurnCore.h "${PIPL_RSRC}")
target_include_directories(PageTurnPro PRIVATE ${SDK_INCLUDES})
target_compile_options(PageTurnPro PRIVATE -O3 -fvisibility=hidden -Wall)
set_target_properties(PageTurnPro PROPERTIES
  BUNDLE TRUE
  BUNDLE_EXTENSION plugin
  PREFIX ""
  MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/mac/Info.plist"
  MACOSX_BUNDLE_BUNDLE_NAME PageTurnPro
  MACOSX_BUNDLE_GUI_IDENTIFIER com.bstnys.pageturnpro)
target_link_libraries(PageTurnPro PRIVATE "-framework CoreFoundation")

add_custom_command(TARGET PageTurnPro POST_BUILD
  COMMAND /bin/echo -n "eFKTFXTC" > "$<TARGET_BUNDLE_CONTENT_DIR:PageTurnPro>/PkgInfo"
  COMMAND codesign --force --sign - "$<TARGET_BUNDLE_DIR:PageTurnPro>"
  COMMENT "Writing PkgInfo and ad-hoc signing")

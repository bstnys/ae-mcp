# Windows x64 build of Page Turn Pro, included from ../CMakeLists.txt.
# Works with MSVC (Visual Studio) and with a MinGW-w64 cross compiler (win/mingw-w64.cmake).
enable_language(RC)
find_package(Python3 REQUIRED COMPONENTS Interpreter)

# The SDK's Windows build preprocesses the .r with cl and converts it with PiPLtool.exe;
# make_pipl.py writes the same resource directly so the cross build works too.
set(PIPL_BIN "${CMAKE_CURRENT_BINARY_DIR}/PageTurnPro.pipl")
set(PIPL_RC "${CMAKE_CURRENT_BINARY_DIR}/PageTurnPro.rc")
add_custom_command(
  OUTPUT "${PIPL_BIN}" "${PIPL_RC}"
  COMMAND Python3::Interpreter "${CMAKE_CURRENT_SOURCE_DIR}/win/make_pipl.py"
          "${CMAKE_CURRENT_SOURCE_DIR}/src/PageTurnProPiPL.r" "${AE_SDK}/Headers/AE_EffectVers.h" "${PIPL_BIN}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/src/PageTurnProPiPL.r" "${CMAKE_CURRENT_SOURCE_DIR}/win/make_pipl.py"
  COMMENT "Writing PiPL")

add_library(PageTurnPro MODULE src/PageTurnPro.cpp src/PageTurnPro.h src/PageTurnCore.h "${PIPL_RC}")
set_source_files_properties("${PIPL_RC}" PROPERTIES GENERATED TRUE OBJECT_DEPENDS "${PIPL_BIN}")
target_include_directories(PageTurnPro PRIVATE ${SDK_INCLUDES})
# AEConfig.h picks the platform from these.
target_compile_definitions(PageTurnPro PRIVATE _WINDOWS WIN32 _WIN64 NOMINMAX MSWindows)
set_target_properties(PageTurnPro PROPERTIES PREFIX "" SUFFIX ".aex" OUTPUT_NAME PageTurnPro)

if(MSVC)
  target_compile_options(PageTurnPro PRIVATE /O2 /W3 /EHsc)
  set_property(TARGET PageTurnPro PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded")
else()
  # MinGW: link the C and C++ runtimes in so the .aex needs no extra DLLs.
  target_compile_options(PageTurnPro PRIVATE -O3 -Wall)
  target_link_options(PageTurnPro PRIVATE -static -static-libgcc -static-libstdc++)
endif()

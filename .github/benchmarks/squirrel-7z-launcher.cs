using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

// Benchmark only: leave Squirrel and its signing path intact while changing ZIP level.
class Launcher {
  static int Main(string[] args) {
    string raw = Environment.CommandLine;
    int start = raw[0] == '"' ? raw.IndexOf('"', 1) + 1 : raw.IndexOf(' ');
    string forwarded = start > 0 ? raw.Substring(start).TrimStart() : "";
    if (args.Length > 0 && args[0] == "a" && args.Contains("-tzip")) {
      forwarded += " -mx=1";
      File.AppendAllText(Environment.GetEnvironmentVariable("SQUIRREL_FAST_AUDIT"), "zip-level-1\n");
    }
    var process = Process.Start(new ProcessStartInfo {
      FileName = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "7z-native.exe"),
      Arguments = forwarded,
      UseShellExecute = false,
      WorkingDirectory = Environment.CurrentDirectory,
    });
    process.WaitForExit();
    return process.ExitCode;
  }
}

import { Config } from "@remotion/cli/config";

// Use a locally installed headless Chrome when one is provided (cloud dev box, CI runner).
// Otherwise Remotion downloads its own Chrome Headless Shell.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setConcurrency(4);

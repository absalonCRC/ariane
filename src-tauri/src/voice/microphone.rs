//! Request macOS audio authorization explicitly before WKWebView capture.
use crate::error::Result;

pub fn request_permission() -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use block2::RcBlock;
        use objc2::runtime::Bool;
        use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
        use std::{sync::mpsc, time::Duration};

        // AVMediaTypeAudio is a process-lifetime framework constant. Only audio
        // is requested; denied/restricted access is never overridden.
        let audio = unsafe { AVMediaTypeAudio }.ok_or("Microphone système indisponible.")?;
        let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) };
        let granted = if status == AVAuthorizationStatus::Authorized {
            true
        } else if status == AVAuthorizationStatus::NotDetermined {
            let (sender, receiver) = mpsc::sync_channel(1);
            let completion = RcBlock::new(move |allowed: Bool| {
                let _ = sender.send(allowed.as_bool());
            });
            // AVFoundation retains the completion block until the user answers.
            // This runs on the existing IPC blocking pool, never the UI thread.
            unsafe {
                AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &completion);
            }
            receiver.recv_timeout(Duration::from_secs(90)).map_err(|_| {
                "L’autorisation du microphone attend une réponse dans macOS.".to_owned()
            })?
        } else {
            false
        };
        if !granted {
            return Err("Accès au microphone refusé. Vérifiez les réglages Micro de macOS.".into());
        }
    }
    Ok(())
}

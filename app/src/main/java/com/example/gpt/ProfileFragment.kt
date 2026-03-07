package com.example.gpt

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import coil.load
import com.example.gpt.databinding.FragmentProfileBinding
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.storage.FirebaseStorage

class ProfileFragment : Fragment() {
    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!
    
    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val storage = FirebaseStorage.getInstance()

    private val getContent = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            uploadProfileImage(it)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        loadUserProfile()
        
        binding.btnChangePhoto.setOnClickListener {
            getContent.launch("image/*")
        }
        
        binding.btnLogout.setOnClickListener {
            auth.signOut()
            val intent = Intent(requireContext(), LoginActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
        }
    }

    private fun loadUserProfile() {
        val user = auth.currentUser ?: return
        
        db.collection("users").document(user.uid).get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    val name = document.getString("name") ?: "Advocate"
                    val role = document.getString("role") ?: "Senior"
                    val photoUrl = document.getString("photoUrl")
                    
                    binding.tvName.text = name
                    binding.tvRole.text = role.replaceFirstChar { it.uppercase() }

                    if (!photoUrl.isNullOrEmpty()) {
                        binding.ivProfile.load(photoUrl) {
                            crossfade(true)
                            placeholder(R.drawable.ic_profile)
                            error(R.drawable.ic_profile)
                        }
                    }
                }
            }
    }

    private fun uploadProfileImage(uri: Uri) {
        val user = auth.currentUser ?: return
        val profileRef = storage.reference.child("profile_images/${user.uid}.jpg")

        Toast.makeText(requireContext(), "Uploading image...", Toast.LENGTH_SHORT).show()

        profileRef.putFile(uri)
            .addOnSuccessListener {
                profileRef.downloadUrl.addOnSuccessListener { downloadUri ->
                    updateProfilePhotoUrl(downloadUri.toString())
                }
            }
            .addOnFailureListener {
                Toast.makeText(requireContext(), "Upload failed: ${it.message}", Toast.LENGTH_SHORT).show()
            }
    }

    private fun updateProfilePhotoUrl(url: String) {
        val user = auth.currentUser ?: return
        db.collection("users").document(user.uid)
            .update("photoUrl", url)
            .addOnSuccessListener {
                Toast.makeText(requireContext(), "Profile photo updated", Toast.LENGTH_SHORT).show()
                binding.ivProfile.load(url) {
                    crossfade(true)
                }
            }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
